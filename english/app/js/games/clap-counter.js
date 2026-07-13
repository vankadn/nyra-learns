import { shuffle } from '../utils.js';
import { speak } from '../audio/tts.js';
import { playChime } from '../audio/tones.js';
import { showGames, showGame } from '../nav.js';

const PREFIX = 'cc';
const DEFAULT_WORD_COUNT = 8;

function pickRandom(arr) {
  if (!arr || !arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildPool(data, challengeOn) {
  const pool = [...(data.oneSyllable || []), ...(data.twoSyllable || []), ...(data.threeSyllable || [])];
  if (challengeOn) pool.push(...(data.fourSyllableChallenge || []));
  return pool;
}

// "Show a word, clap once per syllable you hear, tap Done" — a new engine
// (no existing game had a tap-and-count mechanic to reuse). Deck pulls from
// all of syllables.json's tiers; Challenge Mode folds in the 4-syllable tier.
// No scoring/streak by design — each word is just answer-and-retry, same
// "stay on the word until correct" pattern as Spelling Choice.
export function renderClapCounterSection(data, praises = []) {
  const round = { items: [], idx: 0, taps: 0, locked: false };

  const div = document.createElement('div');
  div.id = 'sec-clap-counter';
  div.className = 'section';

  div.innerHTML = `
    <button class="back-btn" id="ccBackBtn">← Games</button>
    <div class="section-title">👏 Clap Counter</div>
    <div id="cc-setup">
      <div class="tip">👆 Listen to the word, then clap once for every beat (syllable) you hear!</div>
      <div class="ws-count-row">
        <span>Words per round:</span>
        <input type="number" id="cc-word-count" value="${DEFAULT_WORD_COUNT}" min="3" max="20">
      </div>
      <label class="sort-challenge-toggle">
        <input type="checkbox" id="cc-challenge-cb">
        🏆 Challenge Mode — add 4-syllable words
      </label>
      <button class="next-btn" id="ccStartBtn">▶️ Start Clapping!</button>
    </div>
    <div id="cc-play" style="display:none;"></div>
  `;

  div.querySelector('#ccBackBtn').addEventListener('click', () => showGames());
  div.querySelector('#ccStartBtn').addEventListener('click', startRound);

  function startRound() {
    const challengeOn = div.querySelector('#cc-challenge-cb').checked;
    const wordCount = Math.max(1, parseInt(div.querySelector('#cc-word-count').value, 10) || DEFAULT_WORD_COUNT);
    round.items = shuffle(buildPool(data, challengeOn)).slice(0, wordCount);
    round.idx = 0;

    div.querySelector('#cc-setup').style.display = 'none';
    const playEl = div.querySelector('#cc-play');
    playEl.style.display = 'block';
    renderWord(playEl);
  }

  function renderWord(playEl) {
    const current = round.items[round.idx];
    round.taps = 0;
    round.locked = false;

    playEl.innerHTML = `
      <div class="score-bar">
        <span>👏 Word</span>
        <span class="score-num">${round.idx + 1}</span>
        <span>/ ${round.items.length}</span>
      </div>
      <div class="quiz-card" style="text-align:center;">
        <div id="cc-word-tap" style="cursor:pointer;">
          <div style="font-size:3.4rem;line-height:1.1;">${current.emoji}</div>
          <div class="quiz-word">${current.word}</div>
        </div>
        <div class="cc-clap-count" id="cc-count">👏 × 0</div>
        <button class="cc-clap-btn" id="cc-clap-btn" aria-label="Clap">👏</button>
        <button class="next-btn" id="cc-done-btn">✅ Done</button>
        <div class="quiz-result" id="cc-result"></div>
      </div>
    `;

    speak(current.word);
    playEl.querySelector('#cc-word-tap').addEventListener('click', () => speak(current.word));
    playEl.querySelector('#cc-clap-btn').addEventListener('click', () => handleClap(playEl));
    playEl.querySelector('#cc-done-btn').addEventListener('click', () => handleDone(playEl));
  }

  function handleClap(playEl) {
    if (round.locked) return;
    round.taps++;
    playEl.querySelector('#cc-count').textContent = `👏 × ${round.taps}`;
    playChime(523, 0.08);
    const btn = playEl.querySelector('#cc-clap-btn');
    btn.classList.remove('tapped');
    void btn.offsetWidth;
    btn.classList.add('tapped');
  }

  function handleDone(playEl) {
    if (round.locked) return;
    const current = round.items[round.idx];
    const resultEl = playEl.querySelector('#cc-result');

    if (round.taps === current.count) {
      round.locked = true;
      playChime(659, 0.35);
      const breakdown = current.syllables.join('-');
      resultEl.textContent = `${pickRandom(praises) || '🎉 Yes! Great listening!'} (${breakdown})`;
      speak('Correct!');
      setTimeout(() => {
        round.idx++;
        if (round.idx >= round.items.length) finishRound(playEl);
        else renderWord(playEl);
      }, 1400);
    } else {
      round.taps = 0;
      playEl.querySelector('#cc-count').textContent = '👏 × 0';
      resultEl.textContent = 'Not quite — listen for the beats and try again! 👂';
      speak('Listen again');
    }
  }

  function finishRound(playEl) {
    playEl.innerHTML = `
      <div class="quiz-card" style="text-align:center;">
        <div style="font-size:3rem;margin-bottom:8px;">🎉</div>
        <div style="font-family:'Baloo 2',cursive;font-size:1.6rem;color:var(--plum);">
          You clapped out ${round.items.length} words!
        </div>
        <button class="next-btn" id="cc-again-btn">🔄 Play Again!</button>
      </div>
    `;
    playEl.querySelector('#cc-again-btn').addEventListener('click', () => {
      div.querySelector('#cc-setup').style.display = 'block';
      div.querySelector('#cc-play').style.display = 'none';
    });
  }

  return div;
}

export function buildClapCounterGameCard() {
  const card = document.createElement('div');
  card.className = 'game-card';
  card.id = 'gc-clap-counter';
  card.innerHTML = `
    <div class="game-card-icon">👏</div>
    <div class="game-card-name">Clap Counter</div>
    <div class="game-card-desc">Clap once for every beat (syllable) you hear</div>
  `;
  card.addEventListener('click', () => showGame('clap-counter'));
  return card;
}

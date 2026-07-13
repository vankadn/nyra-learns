import { shuffle, escHtml } from '../utils.js';
import { speak } from '../audio/tts.js';
import { playChime } from '../audio/tones.js';
import { celebrate, showReplay } from '../game-engine/game-shell.js';
import { showGames, showGame } from '../nav.js';
import {
  buildPlayersSetupHTML, setupPlayersUI, startPlayersRound, getPlayersState,
  creditCurrentPlayer, advanceTurn, renderPlayerBar, renderPlayerCardRow,
} from '../players.js';

const PREFIX = 'sc';

function pickRandom(arr) {
  if (!arr || !arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

// Generic "tap the right letters to finish the word" game. Works for any
// set shaped { id, title, choices[], deck[] } where each deck entry is
// { word, prefix, suffix, answer, emoji } — no set-specific code.
export function renderSpellingChoiceSection(data, praises = []) {
  const sets = data.sets || [];
  const round = { set: null, items: [], idx: 0, score: 0, wordsSeen: [] };

  const div = document.createElement('div');
  div.id = 'sec-spelling-choice';
  div.className = 'section';

  div.innerHTML = `
    <button class="back-btn" id="scBackBtn">← Games</button>
    <div class="section-title">🔤 Spelling Choice</div>
    <div id="sc-setup">
      <div class="tip">👆 Pick a spelling pattern to practice!</div>
      <div style="display:grid;gap:10px;margin-bottom:4px;">
        ${sets.map(set => `
          <div class="topic-card sc-set-card" data-set-id="${set.id}">
            <span class="topic-icon">${set.deck[0]?.emoji || '🔤'}</span>
            <span class="topic-name">${set.title}</span>
            <span class="topic-eg">${set.deck.slice(1, 4).map(d => d.emoji).join(' ')}</span>
          </div>`).join('')}
      </div>
      ${buildPlayersSetupHTML(PREFIX)}
    </div>
    <div id="sc-play" style="display:none;"></div>
  `;

  setupPlayersUI(div, PREFIX);

  div.querySelector('#scBackBtn').addEventListener('click', () => showGames());
  div.querySelectorAll('.sc-set-card').forEach(card => {
    card.addEventListener('click', () => {
      const set = sets.find(s => s.id === card.dataset.setId);
      if (set) startSet(set);
    });
  });

  function startSet(set, replaySnapshot = null) {
    round.set = set;
    round.items = shuffle(set.deck);
    round.idx = 0;
    round.score = 0;
    round.wordsSeen = [];
    startPlayersRound(div, PREFIX, replaySnapshot);

    div.querySelector('#sc-setup').style.display = 'none';
    const playEl = div.querySelector('#sc-play');
    playEl.style.display = 'block';
    renderWord(playEl);
  }

  function backToSetup() {
    div.querySelector('#sc-setup').style.display = 'block';
    div.querySelector('#sc-play').style.display = 'none';
  }

  function renderWord(playEl) {
    const current = round.items[round.idx];
    const set = round.set;
    const maxLen = Math.max(...set.choices.map(c => c.length));
    const { players } = getPlayersState(PREFIX);

    const scoreboardHTML = players.length
      ? `<div id="${PREFIX}-plyr-bar">${renderPlayerBar(PREFIX)}</div>
         <div class="plyr-progress">Word ${round.idx + 1} of ${round.items.length}</div>`
      : `<div class="score-bar">
           <span>⭐ Score</span>
           <span class="score-num">${round.score}</span>
           <span>/ ${round.items.length}</span>
         </div>`;

    playEl.innerHTML = `
      <div style="display:flex;justify-content:flex-end;margin-bottom:8px;">
        <button id="scChangeSetBtn" style="font-family:'Baloo 2',cursive;background:#90CAF9;border:none;padding:6px 12px;border-radius:20px;cursor:pointer;font-weight:700;">⬅️ Change</button>
      </div>
      ${scoreboardHTML}
      <div class="quiz-card">
        <div class="quiz-question">${set.title}</div>
        <div id="sc-word-tap" style="cursor:pointer;">
          <div style="font-size:3.4rem;line-height:1.1;">${current.emoji}</div>
          <div class="spell-word">${current.prefix}<span class="spell-blank" style="min-width:${maxLen}ch;"></span>${current.suffix}</div>
        </div>
        <div class="quiz-options" id="scOptions"></div>
        <div class="quiz-result" id="scResult"></div>
      </div>
    `;

    playEl.querySelector('#scChangeSetBtn').addEventListener('click', backToSetup);
    playEl.querySelector('#sc-word-tap').addEventListener('click', () => speak(current.word));

    const optionsEl = playEl.querySelector('#scOptions');
    shuffle(set.choices).forEach(choice => {
      const btn = document.createElement('button');
      btn.className = 'quiz-btn';
      btn.textContent = choice;
      btn.addEventListener('click', () => handleTap(playEl, btn, choice, current));
      optionsEl.appendChild(btn);
    });
  }

  function handleTap(playEl, btn, chosen, current) {
    if (btn.disabled) return;
    const resultEl = playEl.querySelector('#scResult');

    if (chosen === current.answer) {
      playEl.querySelectorAll('.quiz-btn').forEach(b => { b.disabled = true; });
      btn.classList.add('correct');
      playChime(659, 0.35);
      resultEl.textContent = pickRandom(praises) || '🎉 Yes! Great spelling!';
      speak('Correct!');
      if (getPlayersState(PREFIX).players.length) creditCurrentPlayer(PREFIX); else round.score++;
      round.wordsSeen.push({ word: current.word, emoji: current.emoji, level: 'easy' });

      setTimeout(() => {
        advanceTurn(PREFIX);
        round.idx++;
        if (round.idx >= round.items.length) finishRound(playEl);
        else renderWord(playEl);
      }, 1000);
    } else {
      btn.disabled = true;
      btn.classList.add('wrong', 'shake');
      setTimeout(() => btn.classList.remove('shake'), 400);
      resultEl.textContent = 'Not quite — try again!';
    }
  }

  function finishRound(playEl) {
    const total = round.items.length;
    const { players } = getPlayersState(PREFIX);

    let scoreText, subtitleHTML;
    if (players.length > 1) {
      const [p0, p1] = players;
      scoreText = `${p0.score} vs ${p1.score}`;
      subtitleHTML = p0.score === p1.score
        ? `${renderPlayerCardRow(players, { showScore: true })}<div class="plyr-result-tie">🤝 It's a tie! ${scoreText}</div>`
        : `${renderPlayerCardRow(players, { showScore: true })}<div class="plyr-result-winner">🏆 ${escHtml((p0.score > p1.score ? p0 : p1).name)} wins! ${scoreText}</div>`;
    } else if (players.length === 1) {
      scoreText = `${players[0].score}/${total}`;
      subtitleHTML = renderPlayerCardRow(players, { showScore: true });
    } else {
      scoreText = `${round.score}/${total}`;
      subtitleHTML = null;
    }

    const onPlayAgain = () => startSet(round.set, getPlayersState(PREFIX).players);

    if (subtitleHTML) {
      playEl.innerHTML = `<div class="quiz-card" style="text-align:center;">${subtitleHTML}</div>`;
      setTimeout(() => {
        showReplay(`${PREFIX}-play`, round.wordsSeen, praises, () =>
          celebrate(`${PREFIX}-play`, 'Great spelling!', `You got ${scoreText}!`, onPlayAgain)
        );
      }, 1200);
    } else {
      showReplay(`${PREFIX}-play`, round.wordsSeen, praises, () =>
        celebrate(`${PREFIX}-play`, 'Great spelling!', `You got ${scoreText}!`, onPlayAgain)
      );
    }
  }

  return div;
}

export function buildSpellingChoiceGameCard() {
  const card = document.createElement('div');
  card.className = 'game-card';
  card.id = 'gc-spelling-choice';
  card.innerHTML = `
    <div class="game-card-icon">🔤</div>
    <div class="game-card-name">Spelling Choice</div>
    <div class="game-card-desc">Pick the right letters to finish the word</div>
  `;
  card.addEventListener('click', () => showGame('spelling-choice'));
  return card;
}

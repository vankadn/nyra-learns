import { speak } from '../audio/tts.js';
import { playChime } from '../audio/tones.js';
import { shuffle } from '../utils.js';
import { sharedRenderStrip } from '../game-engine/tile-tray.js';
import { buildSeqState, renderSeqTiles, renderSeqSlots, wireSeqSlots, trySeqPlace } from '../game-engine/sequence.js';
import { celebrate, showReplay } from '../game-engine/game-shell.js';
import { showGames, showGame } from '../nav.js';

const DEFAULT_WORD_COUNT = 6;

function buildPool(data, challengeOn) {
  const pool = [...(data.oneSyllable || []), ...(data.twoSyllable || []), ...(data.threeSyllable || [])];
  if (challengeOn) pool.push(...(data.fourSyllableChallenge || []));
  return pool;
}

// Same reorder mechanic as Unscramble, but the chunk unit is a syllable
// (`entry.syllables`) instead of a single letter — reuses the exact same
// generic game-engine/sequence.js primitives Unscramble and Sentence Builder
// already share, just fed syllable strings and the "seq-chip" variable-width
// tile/slot classes (Sentence Builder's variant, since chunks aren't 1 char).
export function renderSyllableBuilderSection(data, praises = []) {
  let words = [];
  let activeIdx = 0;
  let selectedTile = null;
  let seqState = null;
  let correctWords = [];

  const div = document.createElement('div');
  div.id = 'sec-syllable-builder';
  div.className = 'section';

  div.innerHTML = `
    <button class="back-btn" id="sbBackBtn">← Games</button>
    <div class="section-title">🧩 Syllable Builder</div>
    <div id="sb-setup">
      <div class="tip">🎮 Put the syllable chunks in order to build the word!</div>
      <div class="ws-count-row">
        <span>Words per round:</span>
        <input type="number" id="sb-word-count" value="${DEFAULT_WORD_COUNT}" min="3" max="20">
      </div>
      <label class="sort-challenge-toggle">
        <input type="checkbox" id="sb-challenge-cb">
        🏆 Challenge Mode — add 4-syllable words
      </label>
      <button class="next-btn" id="sbStartBtn">▶️ Start Building!</button>
    </div>
    <div id="sb-play" style="display:none;"></div>
  `;

  div.querySelector('#sbBackBtn').addEventListener('click', () => showGames());
  div.querySelector('#sbStartBtn').addEventListener('click', startRound);

  function startRound() {
    const challengeOn = div.querySelector('#sb-challenge-cb').checked;
    const wordCount = Math.max(1, parseInt(div.querySelector('#sb-word-count').value, 10) || DEFAULT_WORD_COUNT);
    words = shuffle(buildPool(data, challengeOn)).slice(0, wordCount).map(w => ({ ...w, done: false }));
    activeIdx = 0;
    correctWords = [];
    selectedTile = null;

    div.querySelector('#sb-setup').style.display = 'none';
    const playEl = div.querySelector('#sb-play');
    playEl.style.display = 'block';
    playEl.innerHTML = `
      <div class="g1-progress-strip" id="sb-strip"></div>
      <div class="g1-active-area">
        <div class="g1-emoji-large" id="sb-emoji"></div>
        <div class="g1-blanks" id="sb-slots"></div>
      </div>
      <div class="g1-tray-label">Put the syllables in order</div>
      <div class="g1-tray" id="sb-tray"></div>
      <div class="quiz-result" id="sb-result"></div>
    `;
    refreshStrip();
    loadActive();
  }

  function refreshStrip() {
    sharedRenderStrip(words, activeIdx, 'sb-strip');
  }

  function loadActive() {
    const w = words[activeIdx];
    const emojiEl = document.getElementById('sb-emoji');
    if (emojiEl) {
      emojiEl.textContent = w.emoji;
      emojiEl.onclick = () => speak(w.word);
    }
    const resultEl = document.getElementById('sb-result');
    if (resultEl) resultEl.textContent = '';
    seqState = buildSeqState(w.syllables);
    selectedTile = null;
    refresh();
    speak(w.word);
  }

  function refresh() {
    renderSeqSlots(seqState, 'sb-slots', 'seq-chip-slot', true);
    renderSeqTiles(seqState, 'sb-tray', () => selectedTile, id => { selectedTile = id; }, 'seq-chip');
    wireSeqSlots('sb-slots', () => selectedTile, tryPlace, 'seq-chip-slot');
  }

  function tryPlace(tileId, slotPos) {
    selectedTile = null;
    trySeqPlace(tileId, slotPos, seqState, 'sb-tray', (tile, slot) => {
      tile.placed = true;
      slot.filled = true;
      refresh();
      if (seqState.slots.every(s => s.filled)) {
        const word = words[activeIdx];
        word.done = true;
        correctWords.push({ word: word.word, emoji: word.emoji, level: 'easy' });
        const resultEl = document.getElementById('sb-result');
        if (resultEl) {
          resultEl.textContent = `${word.word} — ${word.count} syllable${word.count !== 1 ? 's' : ''}! 🎉`;
        }
        speak(`${word.word}. ${word.count} syllables!`);
        playChime(659, 0.35);
        setTimeout(() => { refreshStrip(); advance(); }, 1500);
      }
    }, 'seq-chip');
  }

  function advance() {
    let next = words.findIndex((w, i) => !w.done && i > activeIdx);
    if (next === -1) next = words.findIndex(w => !w.done);
    if (next === -1) { finishRound(); return; }
    activeIdx = next;
    refreshStrip();
    loadActive();
  }

  function finishRound() {
    showReplay('sb-play', correctWords, praises, () =>
      celebrate('sb-play', 'Fantastic!', 'You built all the words!', startRound)
    );
  }

  return div;
}

export function buildSyllableBuilderGameCard() {
  const card = document.createElement('div');
  card.className = 'game-card';
  card.id = 'gc-syllable-builder';
  card.innerHTML = `
    <div class="game-card-icon">🧩</div>
    <div class="game-card-name">Syllable Builder</div>
    <div class="game-card-desc">Put the syllable chunks in order to build the word</div>
  `;
  card.addEventListener('click', () => showGame('syllable-builder'));
  return card;
}

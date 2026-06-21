import { speak } from '../audio/tts.js';
import { playChime } from '../audio/tones.js';
import { buildSelectorHTML, setupSelector, getSelectorSentences } from '../selector.js';
import { buildSeqState, renderSeqTiles, renderSeqSlots, wireSeqSlots, trySeqPlace } from '../game-engine/sequence.js';
import { celebrate, showReplay } from '../game-engine/game-shell.js';
import { showGames } from '../nav.js';
import { generateSentenceBuilderPDF } from '../pdf/game-pdf.js';

let _sections = null;
let _praises = [];
let g5Sentences = [];
let g5ActiveIdx = 0;
let g5SelectedTile = null;
let g5SeqState = null;
let g5CorrectWords = [];

export function renderGame5Section(sections, praises = []) {
  _sections = sections;
  _praises = praises;
  const div = document.createElement('div');
  div.id = 'sec-game5';
  div.className = 'section';
  div.innerHTML = `
    <button class="back-btn" id="g5BackBtn">← Games</button>
    <div class="section-title">🧩 Sentence Builder</div>
    <div id="g5-setup">
      <div class="tip">🎮 Put the words in the right order to build the sentence!</div>
      ${buildSelectorHTML(sections, 'g5', { showCount: false })}
      <div style="display:flex;gap:10px;margin-top:14px;">
        <button class="next-btn" id="g5StartBtn" style="flex:1;">▶️ Start!</button>
        <button class="next-btn" id="g5PdfBtn" style="flex:1;background:#2E7D32;box-shadow:0 5px 0 #1B5E20;">📄 Get PDF</button>
      </div>
      <div id="g5SetupErr" class="ws-status"></div>
    </div>
    <div id="g5-play" style="display:none;"></div>
  `;
  setupSelector(div, 'g5');
  div.querySelector('#g5BackBtn').addEventListener('click', () => showGames());
  div.querySelector('#g5StartBtn').addEventListener('click', () => {
    const sentences = getSelectorSentences(sections, div, 'g5');
    const err = div.querySelector('#g5SetupErr');
    if (!sentences.length) { err.textContent = 'No sentences found — try selecting more categories or levels!'; return; }
    err.textContent = '';
    startGame5(div, sentences);
  });
  div.querySelector('#g5PdfBtn').addEventListener('click', async () => {
    const sentences = getSelectorSentences(sections, div, 'g5');
    const err = div.querySelector('#g5SetupErr');
    if (!sentences.length) { err.textContent = 'No sentences found — try selecting more categories or levels!'; return; }
    err.textContent = '';
    const btn = div.querySelector('#g5PdfBtn');
    btn.disabled = true; btn.textContent = '⏳ Preparing…';
    try { await generateSentenceBuilderPDF(sentences); }
    catch (e) { err.textContent = 'PDF error: ' + e.message; console.error(e); }
    finally { btn.disabled = false; btn.textContent = '📄 Get PDF'; }
  });
  return div;
}

function startGame5(containerEl, sentences) {
  g5SelectedTile = null;
  g5ActiveIdx = 0;
  g5CorrectWords = [];
  g5Sentences = sentences.map(s => ({ words: s.words, level: s.level, done: false }));

  containerEl.querySelector('#g5-setup').style.display = 'none';
  const playEl = containerEl.querySelector('#g5-play');
  playEl.style.display = 'block';
  playEl.innerHTML = `
    <div style="text-align:right;"><button class="g-print-btn" id="g5-print-btn" title="Print these sentences">🖨️ PDF</button></div>
    <div class="g5-progress">
      <div class="g5-counter" id="g5-counter"></div>
      <div class="g5-dots" id="g5-dots"></div>
    </div>
    <div class="g1-active-area">
      <div class="g1-blanks" id="g5-slots"></div>
    </div>
    <div class="g1-tray-label">Arrange the words</div>
    <div class="g1-tray" id="g5-tray"></div>
  `;
  playEl.querySelector('#g5-print-btn').addEventListener('click', () =>
    generateSentenceBuilderPDF(g5Sentences.map(s => ({ words: s.words, level: s.level })))
  );
  g5UpdateProgress();
  g5LoadActive();
}

function g5UpdateProgress() {
  const total = g5Sentences.length;
  const current = g5ActiveIdx + 1;
  const counterEl = document.getElementById('g5-counter');
  const dotsEl = document.getElementById('g5-dots');
  if (counterEl) counterEl.textContent = `Sentence ${current} of ${total}`;
  if (dotsEl) {
    dotsEl.innerHTML = g5Sentences.map((s, i) => {
      const cls = s.done ? 'done' : (i === g5ActiveIdx ? 'active' : '');
      return `<div class="g5-dot ${cls}"></div>`;
    }).join('');
  }
}

function g5LoadActive() {
  const s = g5Sentences[g5ActiveIdx];
  g5SeqState = buildSeqState(s.words);
  g5SelectedTile = null;
  g5Refresh();
}

function g5Refresh() {
  renderSeqSlots(g5SeqState, 'g5-slots', 'seq-chip-slot', true);
  renderSeqTiles(g5SeqState, 'g5-tray', () => g5SelectedTile, id => { g5SelectedTile = id; }, 'seq-chip');
  wireSeqSlots('g5-slots', () => g5SelectedTile, g5TryPlace, 'seq-chip-slot');
}

function g5TryPlace(tileId, slotPos) {
  g5SelectedTile = null;
  trySeqPlace(tileId, slotPos, g5SeqState, 'g5-tray', (tile, slot) => {
    tile.placed = true;
    slot.filled = true;
    g5Refresh();
    if (g5SeqState.slots.every(s => s.filled)) {
      const sentence = g5Sentences[g5ActiveIdx];
      sentence.done = true;
      g5CorrectWords.push({ word: sentence.words.join(' '), emoji: '🧩', level: sentence.level || 'easy' });
      speak(sentence.words.join(' '));
      playChime(659, 0.35);
      setTimeout(() => { g5UpdateProgress(); g5Advance(); }, 900);
    }
  }, 'seq-chip');
}

function g5Advance() {
  let next = g5Sentences.findIndex((s, i) => !s.done && i > g5ActiveIdx);
  if (next === -1) next = g5Sentences.findIndex(s => !s.done);
  if (next === -1) {
    const onPlayAgain = () => {
      const secEl = document.getElementById('sec-game5');
      const sentences = getSelectorSentences(_sections, secEl, 'g5');
      if (sentences.length) startGame5(secEl, sentences);
    };
    showReplay('g5-play', g5CorrectWords, _praises, () =>
      celebrate('g5-play', 'Wonderful!', 'You built all the sentences!', onPlayAgain)
    );
    return;
  }
  g5ActiveIdx = next;
  g5UpdateProgress();
  g5LoadActive();
}

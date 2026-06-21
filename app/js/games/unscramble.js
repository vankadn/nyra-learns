import { speak } from '../audio/tts.js';
import { playChime } from '../audio/tones.js';
import { getSelectorWords } from '../selector.js';
import { sharedRenderStrip } from '../game-engine/tile-tray.js';
import { buildSeqState, renderSeqTiles, renderSeqSlots, wireSeqSlots, trySeqPlace } from '../game-engine/sequence.js';
import { celebrate, renderGameSection } from '../game-engine/game-shell.js';
import { generateUnscramblePDF } from '../pdf/game-pdf.js';

let _sections = null;
let g4Words = [];
let g4ActiveIdx = 0;
let g4SelectedTile = null;
let g4SeqState = null;

export function renderGame4Section(sections) {
  _sections = sections;
  return renderGameSection({
    sections,
    id: 'game4',
    prefix: 'g4',
    icon: '🔀',
    title: 'Unscramble',
    tip: '🎮 Put the letters in the right order to spell the word!',
    pdfFn: generateUnscramblePDF,
    startFn: startGame4,
  });
}

function startGame4(containerEl, words) {
  g4SelectedTile = null;
  g4ActiveIdx = 0;
  g4Words = words.map(({ word, emoji, level }) => ({ word, emoji, level, done: false }));

  containerEl.querySelector('#g4-setup').style.display = 'none';
  const playEl = containerEl.querySelector('#g4-play');
  playEl.style.display = 'block';
  playEl.innerHTML = `
    <div style="text-align:right;"><button class="g-print-btn" id="g4-print-btn" title="Print these words">🖨️ PDF</button></div>
    <div class="g1-progress-strip" id="g4-strip"></div>
    <div class="g1-active-area">
      <div class="g1-emoji-large" id="g4-emoji"></div>
      <div class="g1-blanks" id="g4-slots"></div>
    </div>
    <div class="g1-tray-label">Unscramble the letters</div>
    <div class="g1-tray" id="g4-tray"></div>
  `;
  playEl.querySelector('#g4-print-btn').addEventListener('click', () =>
    generateUnscramblePDF(g4Words.map(w => ({ word: w.word, emoji: w.emoji, level: w.level || 'easy' })))
  );
  g4RefreshStrip();
  g4LoadActive();
  speak(g4Words[0].word);
}

function g4RefreshStrip() {
  sharedRenderStrip(g4Words, g4ActiveIdx, 'g4-strip');
}

function g4LoadActive() {
  const w = g4Words[g4ActiveIdx];
  const emojiEl = document.getElementById('g4-emoji');
  if (emojiEl) {
    emojiEl.textContent = w.emoji;
    emojiEl.onclick = () => speak(w.word);
  }
  g4SeqState = buildSeqState(w.word.toUpperCase().split(''));
  g4SelectedTile = null;
  g4Refresh();
}

function g4Refresh() {
  renderSeqSlots(g4SeqState, 'g4-slots');
  renderSeqTiles(g4SeqState, 'g4-tray', () => g4SelectedTile, id => { g4SelectedTile = id; });
  wireSeqSlots('g4-slots', () => g4SelectedTile, g4TryPlace);
}

function g4TryPlace(tileId, slotPos) {
  g4SelectedTile = null;
  trySeqPlace(tileId, slotPos, g4SeqState, 'g4-tray', (tile, slot) => {
    tile.placed = true;
    slot.filled = true;
    g4Refresh();
    if (g4SeqState.slots.every(s => s.filled)) {
      const word = g4Words[g4ActiveIdx];
      word.done = true;
      speak(word.word);
      playChime(659, 0.35);
      setTimeout(() => { g4RefreshStrip(); g4Advance(); }, 550);
    }
  });
}

function g4Advance() {
  let next = g4Words.findIndex((w, i) => !w.done && i > g4ActiveIdx);
  if (next === -1) next = g4Words.findIndex(w => !w.done);
  if (next === -1) {
    celebrate('g4-play', 'Fantastic!', 'You unscrambled all the words!', () => {
      const secEl = document.getElementById('sec-game4');
      startGame4(secEl, getSelectorWords(_sections, secEl, 'g4'));
    });
    return;
  }
  g4ActiveIdx = next;
  g4RefreshStrip();
  g4LoadActive();
  speak(g4Words[g4ActiveIdx].word);
}

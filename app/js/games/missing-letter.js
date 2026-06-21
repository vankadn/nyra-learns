import { shuffle, pickBlankPositions } from '../utils.js';
import { speak } from '../audio/tts.js';
import { playChime } from '../audio/tones.js';
import { getSelectorWords } from '../selector.js';
import { sharedRenderStrip, sharedRenderTray, sharedWireBlanks, sharedTryPlace } from '../game-engine/tile-tray.js';
import { celebrate, renderGameSection } from '../game-engine/game-shell.js';
import { generateMissingLetterPDF } from '../pdf/game-pdf.js';

let _sections = null;
let g3Words = [];
let g3Tiles = [];
let g3ActiveIdx = 0;
let g3SelectedTile = null;
let g3TileCounter = 0;

export function renderGame3Section(sections) {
  _sections = sections;
  return renderGameSection({
    sections,
    id: 'game3',
    prefix: 'g3',
    icon: '✏️',
    title: 'Missing Letter',
    tip: '🎮 Fill in the missing letters to complete each word!',
    pdfFn: generateMissingLetterPDF,
    startFn: startGame3,
  });
}

function startGame3(containerEl, words) {
  g3TileCounter = 0;
  g3SelectedTile = null;
  g3ActiveIdx = 0;
  g3Words = words.map(({ word, emoji, level = 'easy' }) => {
    const blankPos = pickBlankPositions(word, level);
    return {
      word, emoji, level, done: false,
      blanks: word.toUpperCase().split('').map((ch, i) => ({
        letter: ch,
        filled: !blankPos.has(i),
        prefilled: !blankPos.has(i),
      })),
    };
  });
  g3Tiles = shuffle(
    g3Words.flatMap(w =>
      w.blanks.filter(b => !b.prefilled).map(b => ({ id: g3TileCounter++, letter: b.letter, placed: false }))
    )
  );

  containerEl.querySelector('#g3-setup').style.display = 'none';
  const playEl = containerEl.querySelector('#g3-play');
  playEl.style.display = 'block';
  playEl.innerHTML = `
    <div style="text-align:right;"><button class="g-print-btn" id="g3-print-btn" title="Print these words">🖨️ PDF</button></div>
    <div class="g1-progress-strip" id="g3-strip"></div>
    <div class="g1-active-area">
      <div class="g1-emoji-large" id="g3-emoji"></div>
      <div class="g1-blanks" id="g3-blanks"></div>
    </div>
    <div class="tip" style="margin-bottom:8px;font-size:0.82rem;">💡 Drag a tile onto a blank, or tap a tile then tap the blank!</div>
    <div class="g1-tray-label">Missing letters</div>
    <div class="g1-tray" id="g3-tray"></div>
  `;
  playEl.querySelector('#g3-print-btn').addEventListener('click', () =>
    generateMissingLetterPDF(g3Words.map(w => ({ word: w.word, emoji: w.emoji, level: w.level || 'easy' })))
  );
  g3RefreshStrip();
  g3RefreshActive();
  g3RefreshTray();
  speak(g3Words[0].word);
}

function g3RefreshStrip() {
  sharedRenderStrip(g3Words, g3ActiveIdx, 'g3-strip');
}

function g3RefreshActive() {
  const emojiEl = document.getElementById('g3-emoji');
  const blanksEl = document.getElementById('g3-blanks');
  if (!emojiEl || !blanksEl) return;
  const w = g3Words[g3ActiveIdx];
  emojiEl.textContent = w.emoji;
  emojiEl.onclick = () => speak(w.word);
  blanksEl.innerHTML = w.blanks.map((b, pos) => {
    if (b.prefilled) return `<div class="g3-prefilled" data-pos="${pos}">${b.letter}</div>`;
    return `<div class="g1-blank${b.filled ? ' filled' : ''}" data-pos="${pos}">${b.filled ? b.letter : ''}</div>`;
  }).join('');
  sharedWireBlanks(blanksEl, () => g3SelectedTile, g3TryPlace);
}

function g3RefreshTray() {
  sharedRenderTray(g3Tiles, () => g3SelectedTile, 'g3-tray', id => { g3SelectedTile = id; });
}

function g3TryPlace(tileId, pos) {
  g3SelectedTile = null;
  sharedTryPlace(tileId, pos, g3Tiles, g3Words[g3ActiveIdx].blanks, 'g3-tray', (tile, blank) => {
    tile.placed = true;
    blank.filled = true;
    g3RefreshActive();
    g3RefreshTray();
    const word = g3Words[g3ActiveIdx];
    if (word.blanks.filter(b => !b.prefilled).every(b => b.filled)) {
      word.done = true;
      speak(word.word);
      playChime(659, 0.35);
      setTimeout(() => { g3RefreshStrip(); g3Advance(); }, 550);
    }
  });
}

function g3Advance() {
  let next = g3Words.findIndex((w, i) => !w.done && i > g3ActiveIdx);
  if (next === -1) next = g3Words.findIndex(w => !w.done);
  if (next === -1) {
    celebrate('g3-play', 'Brilliant!', 'You found all the missing letters!', () => {
      const secEl = document.getElementById('sec-game3');
      startGame3(secEl, getSelectorWords(_sections, secEl, 'g3'));
    });
    return;
  }
  g3ActiveIdx = next;
  g3RefreshStrip();
  g3RefreshActive();
  speak(g3Words[g3ActiveIdx].word);
}

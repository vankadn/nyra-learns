import { shuffle } from '../utils.js';
import { speak } from '../audio/tts.js';
import { playChime } from '../audio/tones.js';
import { getSelectorWords } from '../selector.js';
import { sharedRenderStrip, sharedRenderTray, sharedWireBlanks, sharedTryPlace } from '../game-engine/tile-tray.js';
import { celebrate, renderGameSection } from '../game-engine/game-shell.js';
import { generateSpellItPDF } from '../pdf/game-pdf.js';

let _sections = null;
let g1Words = [];
let g1Tiles = [];
let g1ActiveIdx = 0;
let g1SelectedTile = null;
let g1TileCounter = 0;

export function renderGame1Section(sections) {
  _sections = sections;
  return renderGameSection({
    sections,
    id: 'game1',
    prefix: 'g1',
    icon: '🔤',
    title: 'Letter Builder',
    tip: '🎮 Pick words, then spell them using letter tiles!',
    pdfFn: generateSpellItPDF,
    startFn: startGame1,
  });
}

function startGame1(containerEl, words) {
  g1TileCounter = 0;
  g1SelectedTile = null;
  g1ActiveIdx = 0;
  g1Words = words.map(({ word, emoji }) => ({
    word, emoji,
    blanks: word.toUpperCase().split('').map(ch => ({ letter: ch, filled: false })),
    done: false,
  }));
  g1Tiles = shuffle(
    g1Words.flatMap(w =>
      w.word.toUpperCase().split('').map(ch => ({ id: g1TileCounter++, letter: ch, placed: false }))
    )
  );

  containerEl.querySelector('#g1-setup').style.display = 'none';
  const playEl = containerEl.querySelector('#g1-play');
  playEl.style.display = 'block';
  playEl.innerHTML = `
    <div style="text-align:right;"><button class="g-print-btn" id="g1-print-btn" title="Print these words">🖨️ PDF</button></div>
    <div class="g1-progress-strip" id="g1-strip"></div>
    <div class="g1-active-area">
      <div class="g1-emoji-large" id="g1-emoji"></div>
      <div class="g1-blanks" id="g1-blanks"></div>
    </div>
    <div class="tip" style="margin-bottom:8px;font-size:0.82rem;">💡 Drag a tile onto a blank, or tap a tile then tap a blank!</div>
    <div class="g1-tray-label">Letter tiles</div>
    <div class="g1-tray" id="g1-tray"></div>
  `;
  playEl.querySelector('#g1-print-btn').addEventListener('click', () =>
    generateSpellItPDF(g1Words.map(w => ({ word: w.word, emoji: w.emoji, level: w.level || 'easy' })))
  );
  g1RefreshStrip();
  g1RefreshActive();
  g1RefreshTray();
  speak(g1Words[0].word);
}

function g1RefreshStrip() {
  sharedRenderStrip(g1Words, g1ActiveIdx, 'g1-strip');
}

function g1RefreshActive() {
  const emojiEl = document.getElementById('g1-emoji');
  const blanksEl = document.getElementById('g1-blanks');
  if (!emojiEl || !blanksEl) return;
  const w = g1Words[g1ActiveIdx];
  emojiEl.textContent = w.emoji;
  emojiEl.onclick = () => speak(w.word);
  blanksEl.innerHTML = w.blanks.map((b, pos) =>
    `<div class="g1-blank${b.filled ? ' filled' : ''}" data-pos="${pos}">${b.filled ? b.letter : ''}</div>`
  ).join('');
  sharedWireBlanks(blanksEl, () => g1SelectedTile, g1TryPlace);
}

function g1RefreshTray() {
  sharedRenderTray(g1Tiles, () => g1SelectedTile, 'g1-tray', id => { g1SelectedTile = id; });
}

function g1TryPlace(tileId, pos) {
  g1SelectedTile = null;
  sharedTryPlace(tileId, pos, g1Tiles, g1Words[g1ActiveIdx].blanks, 'g1-tray', (tile, blank) => {
    tile.placed = true;
    blank.filled = true;
    g1RefreshActive();
    g1RefreshTray();
    const word = g1Words[g1ActiveIdx];
    if (word.blanks.every(b => b.filled)) {
      word.done = true;
      speak(word.word);
      playChime(659, 0.35);
      setTimeout(() => { g1RefreshStrip(); g1Advance(); }, 550);
    }
  });
}

function g1Advance() {
  let next = g1Words.findIndex((w, i) => !w.done && i > g1ActiveIdx);
  if (next === -1) next = g1Words.findIndex(w => !w.done);
  if (next === -1) {
    celebrate('g1-play', 'Amazing!', 'You spelled all the words!', () => {
      const secEl = document.getElementById('sec-game1');
      startGame1(secEl, getSelectorWords(_sections, secEl, 'g1'));
    });
    return;
  }
  g1ActiveIdx = next;
  g1RefreshStrip();
  g1RefreshActive();
  speak(g1Words[g1ActiveIdx].word);
}

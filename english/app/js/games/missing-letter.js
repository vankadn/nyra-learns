import { shuffle, computeMissingLetterBlanks } from '../utils.js';
import { speak } from '../audio/tts.js';
import { playChime } from '../audio/tones.js';
import { getSelectorWords } from '../selector.js';
import { sharedRenderStrip, sharedRenderTray, sharedWireBlanks, sharedTryPlace } from '../game-engine/tile-tray.js';
import { celebrate, renderGameSection, showReplay } from '../game-engine/game-shell.js';
import { renderPlayerBar, onItemComplete, startPlayersRound, getPlayersState } from '../players.js';
import { generateMissingLetterPDF } from '../pdf/game-pdf.js';
import { showGame } from '../nav.js';

// Generic "fill in the missing letters" game. Config-driven like Sound Sort:
// { gameId, prefix, icon, title, tip, sections, blankMode }. `blankMode`
// ('byLevel' | 'start' | 'end') picks which letters get blanked — see
// computeMissingLetterBlanks (utils.js). The original game (gameId: 'game3')
// uses 'byLevel' against the full vowels.json tree, same as before this was
// generalized; 'start'/'end' power the beginning/ending single-consonant-
// sound configs, each against a flat pseudoSection (see main.js).
export function renderMissingLetterSection(config, praises = [], stickerThemes = []) {
  const { gameId, prefix, icon, title, tip, sections, blankMode = 'byLevel' } = config;

  let theme = null;
  let words = [];
  let tiles = [];
  let activeIdx = 0;
  let selectedTile = null;
  let tileCounter = 0;
  let correctWords = [];

  function startRound(containerEl, roundWords) {
    tileCounter = 0;
    selectedTile = null;
    activeIdx = 0;
    correctWords = [];
    words = roundWords.map(({ word, emoji, level = 'easy' }) => {
      const blankPos = computeMissingLetterBlanks(word, level, blankMode);
      return {
        word, emoji, level, done: false,
        blanks: word.toUpperCase().split('').map((ch, i) => ({
          letter: ch,
          filled: !blankPos.has(i),
          prefilled: !blankPos.has(i),
        })),
      };
    });
    tiles = shuffle(
      words.flatMap(w =>
        w.blanks.filter(b => !b.prefilled).map(b => ({ id: tileCounter++, letter: b.letter, placed: false }))
      )
    );

    containerEl.querySelector(`#${prefix}-setup`).style.display = 'none';
    const playEl = containerEl.querySelector(`#${prefix}-play`);
    playEl.style.display = 'block';
    playEl.innerHTML = `
      <div style="text-align:right;"><button class="g-print-btn" id="${prefix}-print-btn" title="Print these words">🖨️ PDF</button></div>
      <div id="${prefix}-plyr-bar">${renderPlayerBar(prefix)}</div>
      <div class="g1-progress-strip" id="${prefix}-strip"></div>
      <div class="g1-active-area">
        <div class="g1-emoji-large" id="${prefix}-emoji"></div>
        <div class="g1-blanks" id="${prefix}-blanks"></div>
      </div>
      <div class="tip" style="margin-bottom:8px;font-size:0.82rem;">💡 Drag a tile onto a blank, or tap a tile then tap the blank!</div>
      <div class="g1-tray-label">Missing letters</div>
      <div class="g1-tray" id="${prefix}-tray"></div>
    `;
    playEl.querySelector(`#${prefix}-print-btn`).addEventListener('click', () =>
      generateMissingLetterPDF(words.map(w => ({ word: w.word, emoji: w.emoji, level: w.level || 'easy' })), { theme, blankMode })
    );
    refreshStrip();
    refreshActive();
    refreshTray();
    speak(words[0].word);
  }

  function refreshStrip() {
    sharedRenderStrip(words, activeIdx, `${prefix}-strip`);
  }

  function refreshActive() {
    const emojiEl = document.getElementById(`${prefix}-emoji`);
    const blanksEl = document.getElementById(`${prefix}-blanks`);
    if (!emojiEl || !blanksEl) return;
    const w = words[activeIdx];
    emojiEl.textContent = w.emoji;
    emojiEl.onclick = () => speak(w.word);
    blanksEl.innerHTML = w.blanks.map((b, pos) => {
      if (b.prefilled) return `<div class="g3-prefilled" data-pos="${pos}">${b.letter}</div>`;
      return `<div class="g1-blank${b.filled ? ' filled' : ''}" data-pos="${pos}">${b.filled ? b.letter : ''}</div>`;
    }).join('');
    sharedWireBlanks(blanksEl, () => selectedTile, tryPlace);
  }

  function refreshTray() {
    sharedRenderTray(tiles, () => selectedTile, `${prefix}-tray`, id => { selectedTile = id; });
  }

  function tryPlace(tileId, pos) {
    selectedTile = null;
    sharedTryPlace(tileId, pos, tiles, words[activeIdx].blanks, `${prefix}-tray`, (tile, blank) => {
      tile.placed = true;
      blank.filled = true;
      refreshActive();
      refreshTray();
      const word = words[activeIdx];
      if (word.blanks.filter(b => !b.prefilled).every(b => b.filled)) {
        word.done = true;
        correctWords.push({ word: word.word, emoji: word.emoji, level: word.level || 'easy' });
        onItemComplete(prefix);
        speak(word.word);
        playChime(659, 0.35);
        setTimeout(() => { refreshStrip(); advance(); }, 550);
      }
    });
  }

  function advance() {
    let next = words.findIndex((w, i) => !w.done && i > activeIdx);
    if (next === -1) next = words.findIndex(w => !w.done);
    if (next === -1) {
      const onPlayAgain = () => {
        const secEl = document.getElementById(`sec-${gameId}`);
        const playerCount = getPlayersState(prefix).players.length || 1;
        startPlayersRound(secEl, prefix, getPlayersState(prefix).players);
        startRound(secEl, getSelectorWords(sections, secEl, prefix, { playerCount }));
      };
      showReplay(`${prefix}-play`, correctWords, praises, () =>
        celebrate(`${prefix}-play`, 'Brilliant!', 'You found all the missing letters!', onPlayAgain)
      );
      return;
    }
    activeIdx = next;
    refreshStrip();
    refreshActive();
    speak(words[activeIdx].word);
  }

  return renderGameSection({
    sections,
    id: gameId,
    prefix,
    icon,
    title,
    tip,
    pdfFn: (roundWords, opts) => generateMissingLetterPDF(roundWords, { ...opts, blankMode }),
    startFn: startRound,
    stickerThemes,
    onThemeChange: t => { theme = t; },
  });
}

export function buildMissingLetterGameCard(config) {
  const card = document.createElement('div');
  card.className = 'game-card';
  card.id = `gc-${config.gameId}`;
  card.innerHTML = `
    <div class="game-card-icon">${config.icon}</div>
    <div class="game-card-name">${config.title}</div>
    <div class="game-card-desc">${config.tip.replace(/^🎮\s*/, '')}</div>
  `;
  card.addEventListener('click', () => showGame(config.gameId));
  return card;
}

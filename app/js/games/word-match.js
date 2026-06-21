import { shuffle } from '../utils.js';
import { speak } from '../audio/tts.js';
import { playChime } from '../audio/tones.js';
import { getSelectorWords } from '../selector.js';
import { celebrate, renderGameSection, showReplay } from '../game-engine/game-shell.js';
import { generateMatchPDF } from '../pdf/game-pdf.js';

let _sections = null;
let _praises = [];
let g2Words = [];
let g2EmojiOrder = [];
let g2Selected = null;
let g2MatchedCount = 0;
let g2MatchedEmoji = new Set();

export function renderGame2Section(sections, praises = []) {
  _sections = sections;
  _praises = praises;
  return renderGameSection({
    sections,
    id: 'game2',
    prefix: 'g2',
    icon: '🔗',
    title: 'Word Match',
    tip: '🎮 Match each word to its picture!',
    pdfFn: generateMatchPDF,
    startFn: startGame2,
  });
}

function startGame2(containerEl, words) {
  g2Words = words.map(({ word, emoji, level }) => ({ word, emoji, level, matched: false }));
  g2EmojiOrder = shuffle([...Array(words.length).keys()]);
  g2Selected = null;
  g2MatchedCount = 0;
  g2MatchedEmoji = new Set();

  containerEl.querySelector('#g2-setup').style.display = 'none';
  const playEl = containerEl.querySelector('#g2-play');
  playEl.style.display = 'block';
  playEl.innerHTML = `
    <div style="text-align:right;"><button class="g-print-btn" id="g2-print-btn" title="Print these words">🖨️ PDF</button></div>
    <div class="tip" style="font-size:0.82rem;margin-bottom:8px;">💡 Tap a word, then tap its picture — or drag to connect!</div>
    <div class="g2-play-area" id="g2-play-area">
      <svg class="g2-svg-overlay" xmlns="http://www.w3.org/2000/svg"></svg>
      <div class="g2-words-col" id="g2-words-col"></div>
      <div class="g2-emoji-col" id="g2-emoji-col"></div>
    </div>
  `;
  playEl.querySelector('#g2-print-btn').addEventListener('click', () => generateMatchPDF(g2Words));

  const playArea = playEl.querySelector('#g2-play-area');
  g2Words.forEach((w, i) => {
    const el = document.createElement('div');
    el.className = 'g2-word-item';
    el.dataset.wordIdx = String(i);
    el.textContent = w.word;
    playArea.querySelector('#g2-words-col').appendChild(el);
  });
  g2EmojiOrder.forEach((wordIdx, pos) => {
    const el = document.createElement('div');
    el.className = 'g2-emoji-item';
    el.dataset.emojiPos = String(pos);
    el.textContent = g2Words[wordIdx].emoji;
    playArea.querySelector('#g2-emoji-col').appendChild(el);
  });

  g2SetupPointerEvents(playArea);
}

function g2SetupPointerEvents(playArea) {
  let ds = null;

  playArea.addEventListener('pointerdown', e => {
    const item = e.target.closest('.g2-word-item, .g2-emoji-item');
    if (!item) return;
    if (item.classList.contains('matched')) {
      if (item.classList.contains('g2-emoji-item'))
        speak(g2Words[g2EmojiOrder[parseInt(item.dataset.emojiPos, 10)]].word);
      return;
    }
    playArea.setPointerCapture(e.pointerId);
    const type = item.classList.contains('g2-word-item') ? 'word' : 'emoji';
    const idx = type === 'word' ? parseInt(item.dataset.wordIdx, 10) : parseInt(item.dataset.emojiPos, 10);
    ds = { type, idx, item, startX: e.clientX, startY: e.clientY, isDragging: false };
  });

  playArea.addEventListener('pointermove', e => {
    if (!ds) return;
    if (!ds.isDragging) {
      if (Math.hypot(e.clientX - ds.startX, e.clientY - ds.startY) < 8) return;
      ds.isDragging = true;
      ds.item.classList.add('g2-dragging');
    }
    const cr = playArea.getBoundingClientRect();
    const er = ds.item.getBoundingClientRect();
    const x1 = ds.type === 'word' ? er.right - cr.left : er.left - cr.left;
    const y1 = er.top + er.height / 2 - cr.top;
    const svg = playArea.querySelector('.g2-svg-overlay');
    let ln = svg.querySelector('#g2-drag-line');
    if (!ln) {
      ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      ln.id = 'g2-drag-line';
      ln.setAttribute('stroke', '#9C27B0');
      ln.setAttribute('stroke-width', '3');
      ln.setAttribute('stroke-dasharray', '8,4');
      ln.setAttribute('stroke-linecap', 'round');
      svg.appendChild(ln);
    }
    ln.setAttribute('x1', x1); ln.setAttribute('y1', y1);
    ln.setAttribute('x2', e.clientX - cr.left); ln.setAttribute('y2', e.clientY - cr.top);
  });

  playArea.addEventListener('pointerup', e => {
    if (!ds) return;
    try { playArea.releasePointerCapture(e.pointerId); } catch (_) {}
    playArea.querySelector('#g2-drag-line')?.remove();
    ds.item.classList.remove('g2-dragging');

    if (ds.isDragging) {
      const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest('.g2-word-item, .g2-emoji-item');
      if (hit && !hit.classList.contains('matched')) {
        const tType = hit.classList.contains('g2-word-item') ? 'word' : 'emoji';
        if (tType !== ds.type) {
          const wi = ds.type === 'word' ? ds.idx : parseInt(hit.dataset.wordIdx, 10);
          const ep = ds.type === 'emoji' ? ds.idx : parseInt(hit.dataset.emojiPos, 10);
          g2TryMatch(wi, ep, playArea);
        }
      }
    } else {
      g2HandleTap(ds.type, ds.idx, ds.item, playArea);
    }
    ds = null;
  });

  playArea.addEventListener('pointercancel', () => {
    if (!ds) return;
    playArea.querySelector('#g2-drag-line')?.remove();
    ds.item.classList.remove('g2-dragging');
    ds = null;
  });
}

function g2HandleTap(type, idx, el, playArea) {
  if (type === 'emoji') speak(g2Words[g2EmojiOrder[idx]].word);
  if (!g2Selected) {
    g2Selected = { type, idx, el };
    el.classList.add('selected');
    return;
  }
  if (g2Selected.type === type) {
    g2Selected.el.classList.remove('selected');
    g2Selected = g2Selected.idx === idx ? null : { type, idx, el };
    if (g2Selected) el.classList.add('selected');
    return;
  }
  g2Selected.el.classList.remove('selected');
  const wi = g2Selected.type === 'word' ? g2Selected.idx : idx;
  const ep = g2Selected.type === 'emoji' ? g2Selected.idx : idx;
  g2Selected = null;
  g2TryMatch(wi, ep, playArea);
}

function g2TryMatch(wordIdx, emojiPos, playArea) {
  if (g2Words[wordIdx].matched || g2MatchedEmoji.has(emojiPos)) return;
  const wordEl = playArea.querySelector(`.g2-word-item[data-word-idx="${wordIdx}"]`);
  const emojiEl = playArea.querySelector(`.g2-emoji-item[data-emoji-pos="${emojiPos}"]`);
  if (!wordEl || !emojiEl) return;

  const cr = playArea.getBoundingClientRect();
  const wr = wordEl.getBoundingClientRect();
  const er = emojiEl.getBoundingClientRect();
  const x1 = wr.right - cr.left,  y1 = wr.top + wr.height / 2 - cr.top;
  const x2 = er.left - cr.left,   y2 = er.top + er.height / 2 - cr.top;

  const svg = playArea.querySelector('.g2-svg-overlay');
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', x1); line.setAttribute('y1', y1);
  line.setAttribute('x2', x2); line.setAttribute('y2', y2);
  line.setAttribute('stroke-width', '4'); line.setAttribute('stroke-linecap', 'round');

  if (wordIdx === g2EmojiOrder[emojiPos]) {
    g2Words[wordIdx].matched = true;
    g2MatchedEmoji.add(emojiPos);
    line.setAttribute('stroke', '#43A047');
    svg.appendChild(line);
    wordEl.classList.add('matched');
    emojiEl.classList.add('matched');
    playChime(659, 0.35);
    g2MatchedCount++;
    if (g2MatchedCount === g2Words.length) {
      setTimeout(() => {
        const correctWords = g2Words.map(w => ({ word: w.word, emoji: w.emoji, level: w.level || 'easy' }));
        const onPlayAgain = () => {
          const secEl = document.getElementById('sec-game2');
          startGame2(secEl, getSelectorWords(_sections, secEl, 'g2'));
        };
        showReplay('g2-play', correctWords, _praises, () =>
          celebrate('g2-play', 'Excellent!', 'You matched all the words!', onPlayAgain)
        );
      }, 700);
    }
  } else {
    line.setAttribute('stroke', '#E53935');
    svg.appendChild(line);
    setTimeout(() => {
      line.style.transition = 'opacity 0.2s';
      line.style.opacity = '0';
      setTimeout(() => line.remove(), 220);
    }, 400);
  }
}

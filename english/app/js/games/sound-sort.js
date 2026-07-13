import { speak } from '../audio/tts.js';
import { playChime } from '../audio/tones.js';
import { getSelectorWords } from '../selector.js';
import { celebrate, renderGameSection, showReplay } from '../game-engine/game-shell.js';
import { renderPlayerBar, renderPlayerCardRow, getPlayersState, creditCurrentPlayer, advanceTurn, startPlayersRound } from '../players.js';
import { generateSoundSortPDF } from '../pdf/game-pdf.js';
import { showGame } from '../nav.js';
import { DEFAULT_EMOJI } from '../emoji.js';
import { escHtml, shuffle } from '../utils.js';

function pickRandom(arr) {
  if (!arr || !arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

// Ice-cream theme: correct sorts stack a scoop on the matching cone instead
// of just outlining a plain bucket. Caps the physical stack so cones never
// overflow the screen — past that, the count keeps going numerically via
// the small ×N badge (see cone-count below).
const MAX_VISIBLE_SCOOPS = 6;

function renderScoops(count, color) {
  let html = '';
  for (let i = 0; i < Math.min(count, MAX_VISIBLE_SCOOPS); i++) {
    html += `<div class="cone-scoop" style="background:${color};bottom:${i * 18}px;"></div>`;
  }
  return html;
}

function renderBuckets(categories, scoopCounts, theme) {
  if (theme === 'icecream') {
    return categories.map(cat => {
      const count = scoopCounts[cat.id] || 0;
      return `
        <button class="sort-bucket-btn cone-btn" data-cat="${cat.id}">
          <div class="cone-scoops">${renderScoops(count, cat.color || '#F48FB1')}</div>
          <div class="cone-shape"></div>
          <span class="sort-bucket-label">${cat.label}</span>
          ${count > MAX_VISIBLE_SCOOPS ? `<span class="cone-count">×${count}</span>` : ''}
        </button>`;
    }).join('');
  }
  return categories.map(cat => `
    <button class="sort-bucket-btn" data-cat="${cat.id}"
      style="background:${cat.color};box-shadow:0 5px 0 ${shade(cat.color)};">
      <span class="sort-bucket-symbol">${cat.symbol || ''}</span>
      <span class="sort-bucket-label">${cat.label}</span>
    </button>`).join('');
}

// Extra words folded into the deck when a game with a `challengeCategory`
// has Challenge Mode opted into for that round — see renderSoundSortSection.
const CHALLENGE_EXTRA_WORDS = 4;

// Darkens a hex color for a bucket button's 3D-shadow edge.
function shade(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, (n >> 16) - 40);
  const g = Math.max(0, ((n >> 8) & 0xff) - 40);
  const b = Math.max(0, (n & 0xff) - 40);
  return `rgb(${r},${g},${b})`;
}

// Generic "tap which sound-category bucket this word belongs to" game.
// Works for any config shaped { gameId, icon, title, instructions, categories[], deck[] }
// (see sound-sort-config.js) — supports 2 or 3 categories, no game-specific code.
export function renderSoundSortSection(config, praises = [], stickerThemes = []) {
  const prefix = 'ss' + config.gameId.replace(/[^a-z0-9]/gi, '');

  // A single-section view of this config's categories, so the standard
  // buildSelectorHTML/getSelectorWords selector (category + level + count)
  // works unmodified — each category becomes one selectable "item".
  const pseudoSection = {
    id: config.gameId,
    title: config.title,
    color: config.categories[0]?.color || '#5C6BC0',
    defaultEmoji: DEFAULT_EMOJI,
    items: config.categories.map(cat => ({
      id: cat.id,
      label: cat.label,
      defaultEmoji: DEFAULT_EMOJI,
      words: config.deck
        .filter(d => d.answer === cat.id)
        .map(({ word, emoji, level }) => ({ word, emoji, level })),
    })),
  };

  const round = { items: [], idx: 0, score: 0, wordsSeen: [], answered: false, scoopCounts: {}, activeCategories: config.categories };

  function startRound(containerEl, words) {
    round.items = words.map(w => ({ word: w.word, emoji: w.emoji, level: w.level, answer: w.itemId }));
    round.idx = 0;
    round.score = 0;
    round.wordsSeen = [];
    round.answered = false;

    const challengeOn = config.challengeCategory
      && containerEl.querySelector(`#${prefix}-challenge-cb`)?.checked;
    round.activeCategories = challengeOn ? [...config.categories, config.challengeCategory] : config.categories;
    if (challengeOn) {
      const extra = shuffle(config.challengeDeck).slice(0, CHALLENGE_EXTRA_WORDS)
        .map(w => ({ word: w.word, emoji: w.emoji, level: w.level, answer: w.answer }));
      round.items = shuffle([...round.items, ...extra]);
    }
    round.scoopCounts = Object.fromEntries(round.activeCategories.map(c => [c.id, 0]));

    containerEl.querySelector(`#${prefix}-setup`).style.display = 'none';
    const playEl = containerEl.querySelector(`#${prefix}-play`);
    playEl.style.display = 'block';
    renderRound(playEl);
  }

  function renderRound(playEl) {
    const current = round.items[round.idx];
    const catCols = round.activeCategories.length;
    const { players } = getPlayersState(prefix);

    const scoreboardHTML = players.length
      ? `<div id="${prefix}-plyr-bar">${renderPlayerBar(prefix)}</div>
         <div class="plyr-progress">Word ${round.idx + 1} of ${round.items.length}</div>`
      : `<div class="score-bar">
           <span>⭐ Score</span>
           <span class="score-num">${round.score}</span>
           <span>/ ${round.items.length}</span>
           <span style="font-size:0.85rem;color:#888;">Word ${round.idx + 1} of ${round.items.length}</span>
         </div>`;

    playEl.innerHTML = `
      ${scoreboardHTML}
      <div class="quiz-card">
        <div class="quiz-question">${config.instructions}</div>
        <div class="sort-word-tap" id="${prefix}-word-tap" style="cursor:pointer;">
          <div style="font-size:3.4rem;line-height:1.1;">${current.emoji}</div>
          <div class="quiz-word">${current.word}</div>
        </div>
        <div class="sort-buckets${config.theme === 'icecream' ? ' sort-buckets-icecream' : ''}" style="grid-template-columns:repeat(${catCols},1fr);">
          ${renderBuckets(round.activeCategories, round.scoopCounts, config.theme)}
        </div>
        <div class="quiz-result" id="${prefix}-result"></div>
      </div>
    `;
    speak(current.word);
    playEl.querySelector(`#${prefix}-word-tap`).addEventListener('click', () => speak(current.word));
    playEl.querySelectorAll('.sort-bucket-btn').forEach(btn => {
      btn.addEventListener('click', () => handleTap(playEl, btn.dataset.cat));
    });
  }

  function handleTap(playEl, catId) {
    if (round.answered) return;
    round.answered = true;

    const current = round.items[round.idx];
    playEl.querySelectorAll('.sort-bucket-btn').forEach(b => { b.disabled = true; });
    const correctBtn = playEl.querySelector(`.sort-bucket-btn[data-cat="${current.answer}"]`);
    const chosenBtn = playEl.querySelector(`.sort-bucket-btn[data-cat="${catId}"]`);
    const resultEl = playEl.querySelector(`#${prefix}-result`);
    const isCorrect = catId === current.answer;
    const correctLabel = round.activeCategories.find(c => c.id === current.answer)?.label || '';

    if (isCorrect) {
      if (getPlayersState(prefix).players.length) creditCurrentPlayer(prefix); else round.score++;
      if (config.theme === 'icecream') round.scoopCounts[current.answer] = (round.scoopCounts[current.answer] || 0) + 1;
      chosenBtn?.classList.add('correct');
      playChime(659, 0.35);
      resultEl.textContent = pickRandom(praises) || '🎉 Yes! Great ears!';
      speak('Correct!');
    } else {
      chosenBtn?.classList.add('wrong');
      correctBtn?.classList.add('correct');
      resultEl.textContent = `Not quite — "${current.word}" is ${correctLabel}!`;
      speak(`It is ${correctLabel}`);
    }
    round.wordsSeen.push({ word: current.word, emoji: current.emoji, level: current.level || 'easy' });

    setTimeout(() => {
      round.answered = false;
      round.idx++;
      advanceTurn(prefix);
      if (round.idx >= round.items.length) finishRound(playEl);
      else renderRound(playEl);
    }, isCorrect ? 1000 : 1700);
  }

  function finishRound(playEl) {
    const total = round.items.length;
    const { players } = getPlayersState(prefix);

    let summaryHTML, scoreText, trophy;
    if (players.length > 1) {
      const [p0, p1] = players;
      scoreText = `${p0.score} vs ${p1.score}`;
      summaryHTML = p0.score === p1.score
        ? `${renderPlayerCardRow(players, { showScore: true })}<div class="plyr-result-tie">🤝 It's a tie! ${scoreText}</div>`
        : `${renderPlayerCardRow(players, { showScore: true })}<div class="plyr-result-winner">🏆 ${escHtml((p0.score > p1.score ? p0 : p1).name)} wins! ${scoreText}</div>`;
      trophy = Math.max(p0.score, p1.score) === total ? '🏆' : '⭐';
    } else if (players.length === 1) {
      scoreText = `${players[0].score}/${total}`;
      summaryHTML = renderPlayerCardRow(players, { showScore: true });
      trophy = players[0].score === total ? '🏆' : '⭐';
    } else {
      scoreText = `${round.score}/${total} correct`;
      summaryHTML = `<div class="score-num" style="font-size:2.2rem;">${scoreText}</div>`;
      trophy = round.score === total ? '🏆' : '⭐';
    }

    playEl.innerHTML = `
      <div class="quiz-card" style="text-align:center;">
        <div style="font-size:3rem;margin-bottom:8px;">${trophy}</div>
        ${summaryHTML}
      </div>`;

    setTimeout(() => {
      const onPlayAgain = () => {
        const secEl = document.getElementById(`sec-${config.gameId}`);
        const playerCount = getPlayersState(prefix).players.length || 1;
        startPlayersRound(secEl, prefix, getPlayersState(prefix).players);
        startRound(secEl, getSelectorWords([pseudoSection], secEl, prefix, { playerCount }));
      };
      showReplay(`${prefix}-play`, round.wordsSeen, praises, () =>
        celebrate(`${prefix}-play`, 'Great sorting!', `You got ${scoreText}!`, onPlayAgain)
      );
    }, 1200);
  }

  const div = renderGameSection({
    sections: [pseudoSection],
    id: config.gameId,
    prefix,
    icon: config.icon,
    title: config.title,
    tip: config.instructions,
    pdfFn: (words, opts) => generateSoundSortPDF(words, opts, config),
    startFn: startRound,
    stickerThemes,
  });

  // Challenge Mode: opt-in, off by default — only rendered when this config
  // has a challengeCategory (see sound-sort-config.js). Lives outside the
  // regular category/level/count selector so it stays a single obvious
  // toggle rather than being buried in the expandable category checkboxes.
  if (config.challengeCategory) {
    const startBtnRow = div.querySelector(`#${prefix}StartBtn`)?.parentElement;
    startBtnRow?.insertAdjacentHTML('beforebegin', `
      <label class="sort-challenge-toggle">
        <input type="checkbox" id="${prefix}-challenge-cb">
        🏆 Challenge Mode — also include ${config.challengeCategory.label}
      </label>`);
  }

  return div;
}

export function buildSoundSortGameCard(config) {
  const card = document.createElement('div');
  card.className = 'game-card';
  card.id = `gc-${config.gameId}`;
  card.innerHTML = `
    <div class="game-card-icon">${config.icon}</div>
    <div class="game-card-name">${config.title}</div>
    <div class="game-card-desc">${config.instructions}</div>
  `;
  card.addEventListener('click', () => showGame(config.gameId));
  return card;
}

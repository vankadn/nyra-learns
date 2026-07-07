import { escHtml } from './utils.js';

const MAX_PLAYERS = 2;
const DEFAULT_AVATAR = '🧒';
const AVATAR_CHOICES = ['🦁', '🐯', '🐸', '🦄', '🐶', '🐱', '🐰', '🐻', '🐼', '🦊'];

// prefix -> { players: [{name, avatar, score}], currentPlayer }
const _registry = new Map();

export function buildPlayersSetupHTML(prefix) {
  const slot = (i, extraBtn) => `
    <div class="plyr-slot" data-slot="${i}" data-emoji="${DEFAULT_AVATAR}" ${i > 0 ? 'style="display:none;"' : ''} id="${prefix}-plyr${i}-slot">
      <button type="button" class="plyr-avatar-btn" id="${prefix}-plyr${i}-avatarbtn">${DEFAULT_AVATAR}</button>
      <div class="plyr-emoji-picker" id="${prefix}-plyr${i}-picker" hidden>
        ${AVATAR_CHOICES.map(e => `<button type="button" class="plyr-emoji-opt" data-emoji="${e}">${e}</button>`).join('')}
      </div>
      <input type="text" class="plyr-name-input" id="${prefix}-plyr${i}-name" placeholder="Player ${i + 1} name" maxlength="20">
      ${extraBtn || ''}
    </div>`;

  return `
    <div class="plyr-setup">
      <div class="plyr-setup-label">🧑‍🤝‍🧑 Playing with a friend? (optional)</div>
      <div class="plyr-slots">
        ${slot(0)}
        ${slot(1, `<button type="button" class="plyr-clear-btn" id="${prefix}-plyr1-remove">✕ remove</button>`)}
      </div>
      <button type="button" class="plyr-add-btn" id="${prefix}-plyr-add">➕ Add second player</button>
    </div>`;
}

export function setupPlayersUI(containerEl, prefix) {
  for (let i = 0; i < MAX_PLAYERS; i++) {
    const slot = containerEl.querySelector(`#${prefix}-plyr${i}-slot`);
    if (!slot) continue;
    const avatarBtn = slot.querySelector(`#${prefix}-plyr${i}-avatarbtn`);
    const picker = slot.querySelector(`#${prefix}-plyr${i}-picker`);

    avatarBtn.addEventListener('click', () => { picker.hidden = !picker.hidden; });
    picker.querySelectorAll('.plyr-emoji-opt').forEach(opt => {
      opt.addEventListener('click', () => {
        const emoji = opt.dataset.emoji;
        avatarBtn.textContent = emoji;
        slot.dataset.emoji = emoji;
        picker.hidden = true;
      });
    });
  }

  const addBtn = containerEl.querySelector(`#${prefix}-plyr-add`);
  const slot1 = containerEl.querySelector(`#${prefix}-plyr1-slot`);
  const removeBtn = containerEl.querySelector(`#${prefix}-plyr1-remove`);
  addBtn?.addEventListener('click', () => {
    slot1.style.display = '';
    addBtn.style.display = 'none';
  });
  removeBtn?.addEventListener('click', () => {
    slot1.style.display = 'none';
    addBtn.style.display = '';
    slot1.querySelector(`#${prefix}-plyr1-name`).value = '';
    slot1.dataset.emoji = DEFAULT_AVATAR;
    slot1.querySelector(`#${prefix}-plyr1-avatarbtn`).textContent = DEFAULT_AVATAR;
  });
}

export function getPlayers(containerEl, prefix) {
  const players = [];
  for (let i = 0; i < MAX_PLAYERS; i++) {
    const slot = containerEl.querySelector(`#${prefix}-plyr${i}-slot`);
    if (!slot || slot.style.display === 'none') continue;
    const name = slot.querySelector(`#${prefix}-plyr${i}-name`).value.trim();
    if (!name) continue;
    players.push({ name, avatar: slot.dataset.emoji || DEFAULT_AVATAR });
  }
  return players;
}

// Called once per round start. `replaySnapshot` ({name,avatar} only, score ignored)
// lets a game's "Play Again" keep the same players while resetting scores to 0.
export function startPlayersRound(containerEl, prefix, replaySnapshot = null) {
  const players = (replaySnapshot ?? getPlayers(containerEl, prefix))
    .map(p => ({ name: p.name, avatar: p.avatar, score: 0 }));
  _registry.set(prefix, { players, currentPlayer: 0 });
}

export function getPlayersState(prefix) {
  return _registry.get(prefix) || { players: [], currentPlayer: 0 };
}

function refreshBar(prefix) {
  const mount = document.getElementById(`${prefix}-plyr-bar`);
  if (mount) mount.innerHTML = renderPlayerBar(prefix);
}

// '' when 0 players -- safe to splice into any template unconditionally.
export function renderPlayerBar(prefix) {
  const { players, currentPlayer } = getPlayersState(prefix);
  if (!players.length) return '';
  return renderPlayerCardRow(players, { activeIndex: players.length > 1 ? currentPlayer : null, showScore: true });
}

export function renderPlayerCardRow(players, { activeIndex = null, showScore = false } = {}) {
  if (!players.length) return '';
  return `<div class="plyr-row">${players.map((p, i) => `
    <div class="plyr-card${i === activeIndex ? ' plyr-card-active' : ''}">
      <div class="plyr-avatar">${escHtml(p.avatar || DEFAULT_AVATAR)}</div>
      <div class="plyr-name">${escHtml(p.name || `Player ${i + 1}`)}</div>
      ${showScore ? `<div class="plyr-score">${p.score}</div>` : ''}
    </div>`).join('')}</div>`;
}

// Credits whoever's turn it is. No-op with 0 players.
export function creditCurrentPlayer(prefix) {
  const state = _registry.get(prefix);
  if (!state || !state.players.length) return false;
  state.players[state.currentPlayer].score++;
  refreshBar(prefix);
  return true;
}

// Alternates whose turn it is. No-op with 0 or 1 players.
export function advanceTurn(prefix) {
  const state = _registry.get(prefix);
  if (!state || state.players.length < 2) return;
  state.currentPlayer = (state.currentPlayer + 1) % state.players.length;
  refreshBar(prefix);
}

// Generic hook for completion-based games with no wrong answers: every completed
// item is simultaneously a point and the end of that player's turn.
export function onItemComplete(prefix) {
  const credited = creditCurrentPlayer(prefix);
  advanceTurn(prefix);
  return credited;
}

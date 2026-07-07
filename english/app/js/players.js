import { escHtml } from './utils.js';

const MAX_PLAYERS = 2;
const DEFAULT_AVATAR = '🧒';
const AVATAR_CHOICES = ['🦁', '🐯', '🐸', '🦄', '🐶', '🐱', '🐰', '🐻', '🐼', '🦊'];

// prefix -> { players: [{name, avatar, score}], currentPlayer }
const _registry = new Map();

// A captured/uploaded photo is stored as its blob: object URL string; a plain
// emoji grapheme is stored as-is. This lets `avatar` stay a single string field
// everywhere (registry, dataset, replay snapshots) with no shape change.
function isPhotoAvatar(avatar) {
  return typeof avatar === 'string' && avatar.startsWith('blob:');
}

// Photo URLs are self-generated (camera capture / local file picker), never
// user-typed, so innerHTML here carries no injection risk.
function avatarInnerHTML(avatar) {
  const a = avatar || DEFAULT_AVATAR;
  return isPhotoAvatar(a) ? `<img src="${a}" class="plyr-avatar-img" alt="">` : escHtml(a);
}

export function buildPlayersSetupHTML(prefix) {
  const slot = (i, extraBtn) => `
    <div class="plyr-slot" data-slot="${i}" data-emoji="${DEFAULT_AVATAR}" ${i > 0 ? 'style="display:none;"' : ''} id="${prefix}-plyr${i}-slot">
      <button type="button" class="plyr-avatar-btn" id="${prefix}-plyr${i}-avatarbtn">${DEFAULT_AVATAR}</button>
      <div class="plyr-emoji-picker" id="${prefix}-plyr${i}-picker" hidden>
        ${AVATAR_CHOICES.map(e => `<button type="button" class="plyr-emoji-opt" data-emoji="${e}">${e}</button>`).join('')}
        <button type="button" class="plyr-emoji-opt plyr-photo-opt" data-action="photo" title="Take a photo">📷</button>
      </div>
      <div class="plyr-camera-panel" id="${prefix}-plyr${i}-camera" hidden></div>
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

function stopStream(stream) {
  stream?.getTracks().forEach(t => t.stop());
}

// Tracks the slot's live camera stream (if any) as a plain JS property -- not
// dataset, since a MediaStream can't be serialized to a string attribute.
function stopSlotCamera(slot) {
  if (slot._camStream) { stopStream(slot._camStream); slot._camStream = null; }
}

function closeCameraPanel(slot, cameraPanel) {
  stopSlotCamera(slot);
  cameraPanel.hidden = true;
  cameraPanel.innerHTML = '';
}

function setSlotAvatar(slot, avatarBtn, avatar) {
  const prev = slot.dataset.emoji;
  if (isPhotoAvatar(prev) && prev !== avatar) URL.revokeObjectURL(prev);
  slot.dataset.emoji = avatar;
  avatarBtn.innerHTML = avatarInnerHTML(avatar);
}

function renderPreviewConfirm(slot, avatarBtn, cameraPanel, url, onRetake) {
  cameraPanel.innerHTML = `
    <img class="plyr-camera-preview-img" src="${url}" alt="">
    <div class="plyr-camera-btn-row">
      <button type="button" class="plyr-camera-btn plyr-camera-use">✅ Use</button>
      <button type="button" class="plyr-camera-btn plyr-camera-cancel">🔄 Retake</button>
    </div>`;
  cameraPanel.querySelector('.plyr-camera-use').addEventListener('click', () => {
    setSlotAvatar(slot, avatarBtn, url);
    cameraPanel.hidden = true;
    cameraPanel.innerHTML = '';
  });
  cameraPanel.querySelector('.plyr-camera-cancel').addEventListener('click', () => {
    URL.revokeObjectURL(url);
    onRetake();
  });
}

function renderFileFallback(slot, avatarBtn, cameraPanel) {
  cameraPanel.innerHTML = `
    <div class="plyr-camera-msg">Camera not available — pick a photo instead:</div>
    <input type="file" accept="image/*" capture="user" class="plyr-camera-file">
    <div class="plyr-camera-btn-row">
      <button type="button" class="plyr-camera-btn plyr-camera-cancel">✕ Cancel</button>
    </div>`;
  cameraPanel.querySelector('.plyr-camera-cancel').addEventListener('click', () => closeCameraPanel(slot, cameraPanel));
  cameraPanel.querySelector('.plyr-camera-file').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    renderPreviewConfirm(slot, avatarBtn, cameraPanel, url, () => renderFileFallback(slot, avatarBtn, cameraPanel));
  });
}

function renderLivePreview(slot, avatarBtn, cameraPanel, stream) {
  slot._camStream = stream;
  cameraPanel.innerHTML = `
    <video class="plyr-camera-video" autoplay playsinline muted></video>
    <div class="plyr-camera-btn-row">
      <button type="button" class="plyr-camera-btn plyr-camera-snap">📸 Capture</button>
      <button type="button" class="plyr-camera-btn plyr-camera-cancel">✕ Cancel</button>
    </div>`;
  const video = cameraPanel.querySelector('.plyr-camera-video');
  video.srcObject = stream;
  // Mirror the on-screen preview only (natural "looking in a mirror" feel) --
  // the canvas draw below reads the raw, unmirrored video frame, so the saved
  // photo comes out correctly oriented, as others actually see the child.
  video.style.transform = 'scaleX(-1)';

  cameraPanel.querySelector('.plyr-camera-cancel').addEventListener('click', () => closeCameraPanel(slot, cameraPanel));
  cameraPanel.querySelector('.plyr-camera-snap').addEventListener('click', () => {
    const size = Math.min(video.videoWidth, video.videoHeight) || 160;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    canvas.getContext('2d').drawImage(
      video,
      (video.videoWidth - size) / 2, (video.videoHeight - size) / 2, size, size,
      0, 0, size, size
    );
    stopSlotCamera(slot);
    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      renderPreviewConfirm(slot, avatarBtn, cameraPanel, url, () => openCameraCapture(slot, avatarBtn, cameraPanel));
    }, 'image/jpeg', 0.9);
  });
}

async function openCameraCapture(slot, avatarBtn, cameraPanel) {
  cameraPanel.hidden = false;
  cameraPanel.innerHTML = `<div class="plyr-camera-msg">Starting camera…</div>`;

  let stream = null;
  try {
    stream = await navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'user' }, audio: false });
  } catch { /* permission denied, no camera, or insecure context -- fall through to file picker */ }

  if (!stream) renderFileFallback(slot, avatarBtn, cameraPanel);
  else renderLivePreview(slot, avatarBtn, cameraPanel, stream);
}

export function setupPlayersUI(containerEl, prefix) {
  for (let i = 0; i < MAX_PLAYERS; i++) {
    const slot = containerEl.querySelector(`#${prefix}-plyr${i}-slot`);
    if (!slot) continue;
    const avatarBtn = slot.querySelector(`#${prefix}-plyr${i}-avatarbtn`);
    const picker = slot.querySelector(`#${prefix}-plyr${i}-picker`);
    const cameraPanel = slot.querySelector(`#${prefix}-plyr${i}-camera`);

    avatarBtn.addEventListener('click', () => {
      closeCameraPanel(slot, cameraPanel);
      picker.hidden = !picker.hidden;
    });
    picker.querySelectorAll('.plyr-emoji-opt[data-emoji]').forEach(opt => {
      opt.addEventListener('click', () => {
        setSlotAvatar(slot, avatarBtn, opt.dataset.emoji);
        picker.hidden = true;
      });
    });
    picker.querySelector('.plyr-photo-opt').addEventListener('click', () => {
      picker.hidden = true;
      openCameraCapture(slot, avatarBtn, cameraPanel);
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
    closeCameraPanel(slot1, slot1.querySelector(`#${prefix}-plyr1-camera`));
    setSlotAvatar(slot1, slot1.querySelector(`#${prefix}-plyr1-avatarbtn`), DEFAULT_AVATAR);
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
      <div class="plyr-avatar">${avatarInnerHTML(p.avatar)}</div>
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

import { shuffle } from '../utils.js';

// Pure-reorder mechanic: every tile belongs to the current item, challenge is sequence not identity.
// Used by Unscramble (items = word letters) and Sentence Builder (items = sentence words).

export function buildSeqState(items) {
  const slots = items.map((text, pos) => ({ pos, text, filled: false }));
  const tiles = shuffle(items.map((text, id) => ({ id, text, placed: false })));
  return { tiles, slots };
}

export function renderSeqTiles(state, containerId, getSelectedId, setSelectedId, tileClass = 'seq-tile') {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '';
  state.tiles.filter(t => !t.placed).forEach(tile => {
    const div = document.createElement('div');
    div.className = tileClass + (getSelectedId() === tile.id ? ' selected' : '');
    div.textContent = tile.text;
    div.draggable = true;
    div.dataset.tileId = String(tile.id);
    div.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', String(tile.id));
      setSelectedId(null);
      el.querySelectorAll('.' + tileClass).forEach(t => t.classList.remove('selected'));
    });
    div.addEventListener('click', () => {
      const cur = getSelectedId();
      const next = cur === tile.id ? null : tile.id;
      setSelectedId(next);
      el.querySelectorAll('.' + tileClass).forEach(t => t.classList.remove('selected'));
      if (next !== null) div.classList.add('selected');
    });
    el.appendChild(div);
  });
}

export function renderSeqSlots(state, containerId, slotClass = 'seq-slot', sizeToContent = false) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = state.slots.map(s => {
    const inner = s.filled
      ? s.text
      : (sizeToContent ? `<span style="opacity:0;pointer-events:none">${s.text}</span>` : '');
    return `<div class="${slotClass}${s.filled ? ' filled' : ''}" data-pos="${s.pos}">${inner}</div>`;
  }).join('');
}

export function wireSeqSlots(containerId, getSelectedId, onPlace, slotClass = 'seq-slot') {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.querySelectorAll(`.${slotClass}:not(.filled)`).forEach(slot => {
    slot.addEventListener('dragover', e => { e.preventDefault(); slot.classList.add('drag-over'); });
    slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'));
    slot.addEventListener('drop', e => {
      e.preventDefault();
      slot.classList.remove('drag-over');
      onPlace(parseInt(e.dataTransfer.getData('text/plain'), 10), parseInt(slot.dataset.pos, 10));
    });
    slot.addEventListener('click', () => {
      const sel = getSelectedId();
      if (sel !== null) onPlace(sel, parseInt(slot.dataset.pos, 10));
    });
  });
}

export function trySeqPlace(tileId, slotPos, state, tileContainerId, onCorrect, tileClass = 'seq-tile') {
  const tile = state.tiles.find(t => t.id === tileId);
  if (!tile || tile.placed) return;
  const slot = state.slots[slotPos];
  if (!slot || slot.filled) return;
  if (tile.text === slot.text) {
    onCorrect(tile, slot);
  } else {
    const trayEl = document.getElementById(tileContainerId);
    if (trayEl) {
      trayEl.querySelectorAll('.' + tileClass).forEach(t => t.classList.remove('selected'));
      const tileEl = trayEl.querySelector(`[data-tile-id="${tileId}"]`);
      if (tileEl) {
        tileEl.classList.add('wrong');
        setTimeout(() => tileEl.classList.remove('wrong'), 450);
      }
    }
  }
}

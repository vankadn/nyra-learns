import { speak } from '../audio/tts.js';

export function sharedRenderStrip(words, activeIdx, stripId) {
  const el = document.getElementById(stripId);
  if (!el) return;
  el.innerHTML = words.map((w, i) => {
    const cls = w.done ? 'done' : (i === activeIdx ? 'active' : '');
    return `<div class="g1-progress-chip ${cls}" data-word="${w.word}">${w.emoji}</div>`;
  }).join('');
  el.querySelectorAll('.g1-progress-chip').forEach(chip =>
    chip.addEventListener('click', () => speak(chip.dataset.word))
  );
}

export function sharedRenderTray(tiles, getSelectedId, trayId, setSelectedId) {
  const tray = document.getElementById(trayId);
  if (!tray) return;
  tray.innerHTML = '';
  tiles.filter(t => !t.placed).forEach(tile => {
    const el = document.createElement('div');
    el.className = 'g1-tile' + (getSelectedId() === tile.id ? ' selected' : '');
    el.textContent = tile.letter;
    el.draggable = true;
    el.dataset.tileId = String(tile.id);
    el.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', String(tile.id));
      setSelectedId(null);
      tray.querySelectorAll('.g1-tile').forEach(t => t.classList.remove('selected'));
    });
    el.addEventListener('click', () => {
      const cur = getSelectedId();
      const next = cur === tile.id ? null : tile.id;
      setSelectedId(next);
      tray.querySelectorAll('.g1-tile').forEach(t => t.classList.remove('selected'));
      if (next !== null) el.classList.add('selected');
    });
    tray.appendChild(el);
  });
}

export function sharedWireBlanks(blanksEl, getSelectedId, onPlace) {
  blanksEl.querySelectorAll('.g1-blank:not(.filled)').forEach(blank => {
    blank.addEventListener('dragover', e => { e.preventDefault(); blank.classList.add('drag-over'); });
    blank.addEventListener('dragleave', () => blank.classList.remove('drag-over'));
    blank.addEventListener('drop', e => {
      e.preventDefault();
      blank.classList.remove('drag-over');
      onPlace(parseInt(e.dataTransfer.getData('text/plain'), 10), parseInt(blank.dataset.pos, 10));
    });
    blank.addEventListener('click', () => {
      const sel = getSelectedId();
      if (sel !== null) onPlace(sel, parseInt(blank.dataset.pos, 10));
    });
  });
}

export function sharedTryPlace(tileId, pos, tiles, blanks, trayId, onCorrect) {
  const tile = tiles.find(t => t.id === tileId);
  if (!tile || tile.placed) return;
  const blank = blanks[pos];
  if (!blank || blank.filled || blank.prefilled) return;
  if (tile.letter === blank.letter) {
    onCorrect(tile, blank);
  } else {
    const tray = document.getElementById(trayId);
    if (tray) {
      tray.querySelectorAll('.g1-tile').forEach(t => t.classList.remove('selected'));
      const tileEl = tray.querySelector(`[data-tile-id="${tileId}"]`);
      if (tileEl) {
        tileEl.classList.add('wrong');
        setTimeout(() => tileEl.classList.remove('wrong'), 450);
      }
    }
  }
}

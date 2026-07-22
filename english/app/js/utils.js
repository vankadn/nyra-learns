export function shuffle(arr) { return arr.slice().sort(() => Math.random() - 0.5); }

export function pickBlankPositions(word, level) {
  const counts = { easy: 1, medium: 2, hard: 3 };
  const count = Math.min(counts[level] || 1, word.length - 1);
  return new Set(shuffle([...Array(word.length).keys()]).slice(0, count));
}

// Missing Letter's blanking strategy: 'byLevel' (default) blanks a random
// count of letters via pickBlankPositions; 'start'/'end' always blank
// exactly the first/last letter, regardless of level — used by the
// beginning/ending single-consonant-sound configs.
export function computeMissingLetterBlanks(word, level, blankMode) {
  if (blankMode === 'start') return new Set([0]);
  if (blankMode === 'end') return new Set([word.length - 1]);
  return pickBlankPositions(word, level);
}

// Rounds `value` to the nearest multiple of `multiple` (ties round up), never
// below `multiple` itself -- so an N-player round always splits into whole turns.
export function roundToNearestMultiple(value, multiple) {
  if (multiple <= 1) return value;
  const lower = Math.floor(value / multiple) * multiple;
  const upper = lower + multiple;
  const rounded = (value - lower) * 2 >= multiple ? upper : lower;
  return Math.max(multiple, rounded);
}

export function escHtml(str) {
  return String(str).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

export function shuffle(arr) { return arr.slice().sort(() => Math.random() - 0.5); }

export function pickBlankPositions(word, level) {
  const counts = { easy: 1, medium: 2, hard: 3 };
  const count = Math.min(counts[level] || 1, word.length - 1);
  return new Set(shuffle([...Array(word.length).keys()]).slice(0, count));
}

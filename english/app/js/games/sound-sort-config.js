import { getEmoji } from '../emoji.js';

// Merges a sound-sort-games.json manifest entry (game metadata: symbol/color
// per category) with the live phonics section data (word/emoji/level) into
// the full runtime config the Sound Sort engine consumes. Adding a new
// sound-sort game only requires a new manifest entry here — no code changes.
export function buildSoundSortConfigs(sections, manifestGames = []) {
  const configs = [];
  for (const game of manifestGames) {
    const sec = sections.find(s => s.id === game.sectionId);
    if (!sec) continue;

    const catMetaById = new Map(game.categories.map(c => [c.id, c]));
    const categories = [];
    const deck = [];
    for (const item of sec.items) {
      const meta = catMetaById.get(item.id);
      if (!meta) continue;
      categories.push({
        id: item.id,
        label: item.label,
        symbol: meta.symbol || '',
        color: meta.color || sec.color,
      });
      for (const w of item.words) {
        deck.push({
          word: w.word,
          emoji: getEmoji(w, item, sec),
          level: w.level || 'easy',
          answer: item.id,
        });
      }
    }
    if (!categories.length || !deck.length) continue;

    configs.push({
      gameId: game.gameId,
      icon: game.icon || '🔤',
      title: game.title,
      instructions: game.instructions,
      categories,
      deck,
    });
  }
  return configs;
}

import { getEmoji } from '../emoji.js';

function tierCategory(c) {
  return { id: c.id, label: c.label || c.id, symbol: c.symbol || '', color: c.color || '#5C6BC0' };
}

function tierDeck(tierWords, categoryId) {
  return (tierWords || []).map(w => ({ word: w.word, emoji: w.emoji, level: w.level || 'easy', answer: categoryId }));
}

// Merges a sound-sort-games.json manifest entry (game metadata: symbol/color
// per category) with live word data into the full runtime config the Sound
// Sort engine consumes. Adding a new sound-sort game only requires a new
// manifest entry here — no code changes. Three sources of word data are
// supported, picked per manifest entry:
// - `sectionId` (the original path): a vowels.json section whose items map
//   1:1 onto this game's categories (e.g. g-variations' hard-g/soft-g).
// - `setId`: a Spelling Choice set (spelling-choice.json) whose deck already
//   carries a per-word `answer` matching a category id — used when a game's
//   categories don't correspond to separate phonics items (e.g. igh/ie/y are
//   one bundled vowel-teams item, not three), so the category mapping is
//   read from Spelling Choice's `answer` field instead of being duplicated.
// - `tiers`: an array of `{ tierKey, id, label, color, symbol }` pointing at
//   flat top-level arrays in syllables.json (e.g. `oneSyllable`) — used when
//   the word source isn't shaped like sections/items at all. An optional
//   sibling `challengeTier` (same shape, singular) is parsed the same way
//   into `config.challengeCategory`/`config.challengeDeck`, kept separate
//   from `categories`/`deck` so the base game never includes it — it's only
//   folded in at runtime if the player opts into Challenge Mode.
export function buildSoundSortConfigs(sections, manifestGames = [], spellingChoiceSets = [], syllablesData = null) {
  const configs = [];
  for (const game of manifestGames) {
    let categories = [];
    let deck = [];
    let challengeCategory = null;
    let challengeDeck = [];

    if (game.tiers) {
      if (!syllablesData) continue;
      for (const tier of game.tiers) {
        categories.push(tierCategory(tier));
        deck.push(...tierDeck(syllablesData[tier.tierKey], tier.id));
      }
      if (game.challengeTier) {
        challengeCategory = tierCategory(game.challengeTier);
        challengeDeck = tierDeck(syllablesData[game.challengeTier.tierKey], game.challengeTier.id);
      }
    } else if (game.setId) {
      const set = spellingChoiceSets.find(s => s.id === game.setId);
      if (!set) continue;
      const validIds = new Set(game.categories.map(c => c.id));
      categories = game.categories.map(c => ({
        id: c.id,
        label: c.label || c.id,
        symbol: c.symbol || '',
        color: c.color || '#5C6BC0',
      }));
      deck = set.deck
        .filter(entry => validIds.has(entry.answer))
        .map(entry => ({
          word: entry.word,
          emoji: entry.emoji,
          level: entry.level || 'easy',
          answer: entry.answer,
        }));
    } else {
      const sec = sections.find(s => s.id === game.sectionId);
      if (!sec) continue;
      const catMetaById = new Map(game.categories.map(c => [c.id, c]));
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
    }
    if (!categories.length || !deck.length) continue;

    configs.push({
      gameId: game.gameId,
      icon: game.icon || '🔤',
      title: game.title,
      instructions: game.instructions,
      theme: game.theme || null,
      categories,
      deck,
      challengeCategory,
      challengeDeck,
    });
  }
  return configs;
}

export const DEFAULT_EMOJI = '📖';

export function getEmoji(wordObj, item, sec) {
  if (wordObj && wordObj.emoji) return wordObj.emoji;
  if (item && item.defaultEmoji) return item.defaultEmoji;
  if (sec && sec.defaultEmoji) return sec.defaultEmoji;
  return DEFAULT_EMOJI;
}

export const emojiCache = new Map();

export function emojiToTwemojiUrl(emoji) {
  const cps = [];
  for (let i = 0; i < emoji.length; ) {
    const cp = emoji.codePointAt(i);
    if (cp !== 0xFE0F) cps.push(cp.toString(16));
    i += cp > 0xFFFF ? 2 : 1;
  }
  return `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/${cps.join('-')}.png`;
}

export async function loadEmojiImage(emoji) {
  if (emojiCache.has(emoji)) return emojiCache.get(emoji);
  try {
    const res = await fetch(emojiToTwemojiUrl(emoji));
    if (!res.ok) { emojiCache.set(emoji, null); return null; }
    const blob = await res.blob();
    const dataUrl = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
    emojiCache.set(emoji, dataUrl);
    return dataUrl;
  } catch {
    emojiCache.set(emoji, null);
    return null;
  }
}

export function hexToRgb(hex) {
  return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
}

export function drawCornerStickers(doc, theme, pageW, pageH) {
  if (!theme) return;
  const csz = 12;
  const corners = [
    [2, 2],
    [pageW - csz - 2, 2],
    [2, pageH - csz - 2],
    [pageW - csz - 2, pageH - csz - 2],
  ];
  const numPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= numPages; p++) {
    doc.setPage(p);
    theme.emoji.forEach((e, i) => {
      const img = emojiCache.get(e);
      if (!img) return;
      const [cx, cy] = corners[i % corners.length];
      doc.addImage(img, 'PNG', cx, cy, csz, csz);
    });
  }
}

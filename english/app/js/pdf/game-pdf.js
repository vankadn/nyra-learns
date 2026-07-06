import { emojiCache, loadEmojiImage, drawCornerStickers } from './pdf-utils.js';
import { shuffle, pickBlankPositions } from '../utils.js';

export async function generateMatchPDF(words, { theme } = {}) {
  if (!window.jspdf) throw new Error('PDF library not loaded');
  await Promise.all([...new Set(words.map(w => w.emoji))].map(e => loadEmojiImage(e)));
  if (theme) await Promise.all(theme.emoji.map(e => loadEmojiImage(e)));

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'letter', orientation: 'portrait' });
  const pageW = 215.9, pageH = 279.4;
  const mL = 20, mT = 20;
  const colW = 68;
  const midGap = pageW - mL * 2 - colW * 2;
  const rightColX = mL + colW + midGap;
  const rowH = 20, emojiSz = 11, dotR = 1.8;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
  doc.text('Draw a line to match each word to its picture!', pageW / 2, mT, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.setTextColor(130, 130, 130);
  doc.text('Name: _________________________', mL, mT + 9);
  doc.setTextColor(0, 0, 0);

  const emojiOrder = shuffle([...Array(words.length).keys()]);
  let y = mT + 18;

  for (let i = 0; i < words.length; i++) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(20, 20, 20);
    doc.text(words[i].word, mL + 3, y + rowH / 2 + 2);
    const leftDotX = mL + 3 + doc.getTextWidth(words[i].word) + 4;

    doc.setFillColor(100, 100, 220);
    doc.circle(leftDotX, y + rowH / 2, dotR, 'F');
    doc.circle(rightColX + 2, y + rowH / 2, dotR, 'F');

    const imgData = emojiCache.get(words[emojiOrder[i]].emoji);
    if (imgData) doc.addImage(imgData, 'PNG', rightColX + 6, y + (rowH - emojiSz) / 2, emojiSz, emojiSz);

    y += rowH + 5;
  }

  drawCornerStickers(doc, theme, pageW, pageH);
  doc.save(`Nyra-Match-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export async function generateSpellItPDF(words, { title = 'Spell the word!', filename, theme } = {}) {
  if (!window.jspdf) throw new Error('PDF library not loaded');
  await Promise.all([...new Set(words.map(w => w.emoji))].map(e => loadEmojiImage(e)));
  if (theme) await Promise.all(theme.emoji.map(e => loadEmojiImage(e)));

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'letter', orientation: 'portrait' });
  const pageW = 215.9, pageH = 279.4, mL = 20, mT = 20;
  const usableW = pageW - mL * 2;
  const emojiSz = 14, emojiGap = 6;
  const boxH = 16, boxW = 10, boxGap = 3;
  const tileH = 14, tileW = 10, tileGap = 3;
  const baseRowH = 22, rowGap = 6;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text(title, pageW / 2, mT, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.setTextColor(130, 130, 130);
  doc.text('Name: _________________________', mL, mT + 9);
  doc.setTextColor(0, 0, 0);

  let y = mT + 18;
  for (const w of words) {
    const letters = w.word.toUpperCase().split('');
    const boxSectionW = letters.length * boxW + (letters.length - 1) * boxGap;
    const tilesX = mL + emojiSz + emojiGap + boxSectionW + 10;
    const availForTiles = mL + usableW - tilesX;
    const tilesPerRow = Math.max(1, Math.floor((availForTiles + tileGap) / (tileW + tileGap)));
    const numTileRows = Math.ceil(letters.length / tilesPerRow);
    const totalTileH = numTileRows * tileH + (numTileRows - 1) * 2;
    const rowH = Math.max(baseRowH, totalTileH + 6);

    const imgData = emojiCache.get(w.emoji);
    if (imgData) doc.addImage(imgData, 'PNG', mL, y + (rowH - emojiSz) / 2, emojiSz, emojiSz);

    let bx = mL + emojiSz + emojiGap;
    for (let i = 0; i < letters.length; i++) {
      doc.setDrawColor(120, 120, 120); doc.setLineWidth(0.5);
      doc.rect(bx, y + (rowH - boxH) / 2, boxW, boxH);
      bx += boxW + boxGap;
    }

    const shuffled = shuffle([...letters]);
    let tx = tilesX, ty = y + (rowH - totalTileH) / 2;
    shuffled.forEach((ch, i) => {
      if (i > 0 && i % tilesPerRow === 0) { tx = tilesX; ty += tileH + 2; }
      doc.setFillColor(255, 249, 196); doc.setDrawColor(100, 50, 150); doc.setLineWidth(0.5);
      doc.roundedRect(tx, ty, tileW, tileH, 2, 2, 'FD');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(30, 30, 30);
      doc.text(ch, tx + tileW / 2, ty + tileH / 2 + 2, { align: 'center' });
      doc.setTextColor(0, 0, 0);
      tx += tileW + tileGap;
    });

    y += rowH + rowGap;
  }

  drawCornerStickers(doc, theme, pageW, pageH);
  doc.save(filename || `Nyra-SpellIt-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function generateUnscramblePDF(words, { theme } = {}) {
  return generateSpellItPDF(words, {
    title: 'Unscramble the letters!',
    filename: `Nyra-Unscramble-${new Date().toISOString().slice(0, 10)}.pdf`,
    theme,
  });
}

export async function generateMissingLetterPDF(words, { theme } = {}) {
  if (!window.jspdf) throw new Error('PDF library not loaded');
  await Promise.all([...new Set(words.map(w => w.emoji))].map(e => loadEmojiImage(e)));
  if (theme) await Promise.all(theme.emoji.map(e => loadEmojiImage(e)));

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'letter', orientation: 'portrait' });
  const pageW = 215.9, pageH = 279.4, mL = 20, mT = 20;
  const usableW = pageW - mL * 2;
  const emojiSz = 14, emojiGap = 6;
  const boxH = 16, boxW = 10, boxGap = 3;
  const tileH = 14, tileW = 10, tileGap = 3;
  const baseRowH = 22, rowGap = 6;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text('Fill in the missing letters!', pageW / 2, mT, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.setTextColor(130, 130, 130);
  doc.text('Name: _________________________', mL, mT + 9);
  doc.setTextColor(0, 0, 0);

  let y = mT + 18;
  for (const w of words) {
    const blankPos = pickBlankPositions(w.word, w.level || 'easy');
    const letters = w.word.toUpperCase().split('');
    const missing = shuffle(letters.filter((_, i) => blankPos.has(i)));
    const boxSectionW = letters.length * boxW + (letters.length - 1) * boxGap;
    const tilesX = mL + emojiSz + emojiGap + boxSectionW + 10;
    const availForTiles = mL + usableW - tilesX;
    const tilesPerRow = Math.max(1, Math.floor((availForTiles + tileGap) / (tileW + tileGap)));
    const numTileRows = missing.length > 0 ? Math.ceil(missing.length / tilesPerRow) : 0;
    const totalTileH = numTileRows > 0 ? numTileRows * tileH + (numTileRows - 1) * 2 : 0;
    const rowH = Math.max(baseRowH, totalTileH + 6);

    const imgData = emojiCache.get(w.emoji);
    if (imgData) doc.addImage(imgData, 'PNG', mL, y + (rowH - emojiSz) / 2, emojiSz, emojiSz);

    let bx = mL + emojiSz + emojiGap;
    letters.forEach((ch, i) => {
      doc.setDrawColor(120, 120, 120); doc.setLineWidth(0.5);
      if (blankPos.has(i)) {
        doc.setFillColor(255, 255, 255);
        doc.rect(bx, y + (rowH - boxH) / 2, boxW, boxH, 'FD');
      } else {
        doc.setFillColor(235, 235, 235);
        doc.rect(bx, y + (rowH - boxH) / 2, boxW, boxH, 'FD');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(100, 100, 100);
        doc.text(ch, bx + boxW / 2, y + rowH / 2 + 2.5, { align: 'center' });
        doc.setTextColor(0, 0, 0);
      }
      bx += boxW + boxGap;
    });

    let tx = tilesX, ty = y + (rowH - totalTileH) / 2;
    missing.forEach((ch, i) => {
      if (i > 0 && i % tilesPerRow === 0) { tx = tilesX; ty += tileH + 2; }
      doc.setFillColor(255, 249, 196); doc.setDrawColor(100, 50, 150); doc.setLineWidth(0.5);
      doc.roundedRect(tx, ty, tileW, tileH, 2, 2, 'FD');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(30, 30, 30);
      doc.text(ch, tx + tileW / 2, ty + tileH / 2 + 2, { align: 'center' });
      doc.setTextColor(0, 0, 0);
      tx += tileW + tileGap;
    });

    y += rowH + rowGap;
  }

  drawCornerStickers(doc, theme, pageW, pageH);
  doc.save(`Nyra-MissingLetter-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export async function generateSoundSortPDF(words, { theme } = {}, config = {}) {
  if (!window.jspdf) throw new Error('PDF library not loaded');
  await Promise.all([...new Set(words.map(w => w.emoji))].map(e => loadEmojiImage(e)));
  if (theme) await Promise.all(theme.emoji.map(e => loadEmojiImage(e)));

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'letter', orientation: 'portrait' });
  const pageW = 215.9, pageH = 279.4, mL = 20, mT = 20, mB = 15;
  const emojiSz = 12, rowH = 16, circleR = 3;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text(config.title || 'Sound Sort', pageW / 2, mT, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.setTextColor(130, 130, 130);
  doc.text('Name: _________________________', mL, mT + 9);
  doc.setTextColor(0, 0, 0);

  const categories = config.categories || [];
  const bucketColW = 34;
  const bucketsX = pageW - mL - categories.length * bucketColW;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
  categories.forEach((cat, i) => {
    const cx = bucketsX + i * bucketColW + bucketColW / 2;
    doc.text(`${cat.symbol ? cat.symbol + ' ' : ''}${cat.label}`, cx, mT + 15, { align: 'center' });
  });

  let y = mT + 22;
  for (const w of words) {
    if (y + rowH > pageH - mB) { doc.addPage(); y = mT; }

    const imgData = emojiCache.get(w.emoji);
    if (imgData) doc.addImage(imgData, 'PNG', mL, y, emojiSz, emojiSz);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(20, 20, 20);
    doc.text(w.word, mL + emojiSz + 5, y + emojiSz / 2 + 3);
    doc.setTextColor(0, 0, 0);

    categories.forEach((cat, i) => {
      const cx = bucketsX + i * bucketColW + bucketColW / 2;
      doc.setDrawColor(120, 120, 120); doc.setLineWidth(0.5);
      doc.circle(cx, y + emojiSz / 2, circleR);
    });

    y += rowH;
  }

  drawCornerStickers(doc, theme, pageW, pageH);
  doc.save(`Nyra-${config.gameId || 'SoundSort'}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export async function generateSentenceBuilderPDF(sentences, { theme } = {}) {
  if (!window.jspdf) throw new Error('PDF library not loaded');
  if (theme) await Promise.all(theme.emoji.map(e => loadEmojiImage(e)));
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'letter', orientation: 'portrait' });
  const pageW = 215.9, pageH = 279.4, mL = 20, mT = 20;
  const chipH = 12, slotH = 14, chipPadX = 4, chipGap = 3, rowGap = 10;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text('Build the sentence!', pageW / 2, mT, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.setTextColor(130, 130, 130);
  doc.text('Name: _________________________', mL, mT + 9);
  doc.setTextColor(0, 0, 0);

  let y = mT + 18;
  for (const sentence of sentences) {
    const shuffled = [...sentence.words].sort(() => Math.random() - 0.5);

    // Measure each word width
    doc.setFontSize(11);
    const wordWidths = sentence.words.map(w => doc.getTextWidth(w) + chipPadX * 2);

    // Chip row (shuffled order, yellow tiles)
    let x = mL;
    for (const word of shuffled) {
      const w = doc.getTextWidth(word) + chipPadX * 2;
      doc.setFillColor(255, 249, 196); doc.setDrawColor(100, 50, 150); doc.setLineWidth(0.5);
      doc.roundedRect(x, y, w, chipH, 2, 2, 'FD');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(30, 30, 30);
      doc.text(word, x + w / 2, y + chipH / 2 + 2, { align: 'center' });
      doc.setTextColor(0, 0, 0);
      x += w + chipGap;
    }

    // Slot row (correct order, empty boxes)
    x = mL;
    const slotY = y + chipH + 4;
    for (let i = 0; i < sentence.words.length; i++) {
      const w = wordWidths[i];
      doc.setFillColor(255, 255, 255); doc.setDrawColor(120, 120, 120); doc.setLineWidth(0.5);
      doc.rect(x, slotY, w, slotH);
      x += w + chipGap;
    }

    y += chipH + slotH + 4 + rowGap;
  }

  drawCornerStickers(doc, theme, pageW, pageH);
  doc.save(`Nyra-SentenceBuilder-${new Date().toISOString().slice(0, 10)}.pdf`);
}

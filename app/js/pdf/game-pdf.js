import { emojiCache, loadEmojiImage } from './pdf-utils.js';
import { shuffle, pickBlankPositions } from '../utils.js';

export async function generateMatchPDF(words) {
  if (!window.jspdf) throw new Error('PDF library not loaded');
  await Promise.all([...new Set(words.map(w => w.emoji))].map(e => loadEmojiImage(e)));

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'letter', orientation: 'portrait' });
  const pageW = 215.9;
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

  doc.save(`Nyra-Match-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export async function generateSpellItPDF(words) {
  if (!window.jspdf) throw new Error('PDF library not loaded');
  await Promise.all([...new Set(words.map(w => w.emoji))].map(e => loadEmojiImage(e)));

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'letter', orientation: 'portrait' });
  const pageW = 215.9, mL = 20, mT = 20;
  const usableW = pageW - mL * 2;
  const emojiSz = 14, emojiGap = 6;
  const boxH = 16, boxW = 10, boxGap = 3;
  const tileH = 14, tileW = 10, tileGap = 3;
  const baseRowH = 22, rowGap = 6;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text('Spell the word!', pageW / 2, mT, { align: 'center' });
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

  doc.save(`Nyra-SpellIt-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export async function generateMissingLetterPDF(words) {
  if (!window.jspdf) throw new Error('PDF library not loaded');
  await Promise.all([...new Set(words.map(w => w.emoji))].map(e => loadEmojiImage(e)));

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'letter', orientation: 'portrait' });
  const pageW = 215.9, mL = 20, mT = 20;
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

  doc.save(`Nyra-MissingLetter-${new Date().toISOString().slice(0, 10)}.pdf`);
}

import { emojiCache, loadEmojiImage, hexToRgb, drawCornerStickers } from './pdf-utils.js';
import { getEmoji } from '../emoji.js';
import { shuffle } from '../utils.js';
import { buildSelectorHTML, setupSelector } from '../selector.js';

export function renderWorksheetSection(sections, stickerThemes = []) {
  let selectedTheme = null;

  const div = document.createElement('div');
  div.id = 'sec-worksheet';
  div.className = 'section';

  div.innerHTML = `<div class="section-title">Worksheet Generator</div>
  <div class="tip">📝 Pick categories, set word count, then download your PDF!</div>
  ${buildSelectorHTML(sections, 'ws', { defaultCount: 25, minCount: 1, maxCount: 200, countLabel: 'Words per category:' })}
  <div class="ws-notes-row">
    <label>
      <input type="checkbox" id="wsMixAll">
      🎲 Mix all selected words together (one shuffled list instead of by category)
    </label>
  </div>
  <div class="ws-notes-row" id="wsNotesRow">
    <label>
      <input type="checkbox" id="wsIncludeNotes">
      📋 Include teaching notes in PDF
    </label>
  </div>
  <div id="wsThemePicker"></div>
  <button class="next-btn" id="wsGenerateBtn" type="button">&#128196; Download PDF</button>
  <div class="ws-status" id="wsStatus"></div>`;

  setupSelector(div, 'ws');

  const mixAllCb = div.querySelector('#wsMixAll');
  const notesCb = div.querySelector('#wsIncludeNotes');
  const notesRow = div.querySelector('#wsNotesRow');
  const countLabelEl = div.querySelector('#ws-count-label');
  mixAllCb.addEventListener('change', () => {
    const mixed = mixAllCb.checked;
    notesCb.disabled = mixed;
    if (mixed) notesCb.checked = false;
    notesRow.style.opacity = mixed ? 0.5 : 1;
    if (countLabelEl) countLabelEl.textContent = mixed ? 'Total words:' : 'Words per category:';
  });

  if (stickerThemes.length) {
    const pickerEl = div.querySelector('#wsThemePicker');
    pickerEl.innerHTML = `
      <div class="ws-theme-label">🎨 Corner stickers (optional):</div>
      <div class="ws-theme-row">${stickerThemes.map(t =>
        `<div class="ws-theme-card" id="wst-${t.id}" data-theme-id="${t.id}">
           <div class="ws-theme-card-emoji">${t.emoji[0]}</div>
           <div>${t.label}</div>
         </div>`
      ).join('')}</div>`;

    pickerEl.querySelectorAll('.ws-theme-card').forEach(card => {
      card.addEventListener('click', () => {
        const tid = card.dataset.themeId;
        selectedTheme = selectedTheme?.id === tid ? null : stickerThemes.find(t => t.id === tid);
        pickerEl.querySelectorAll('.ws-theme-card').forEach(c => c.classList.remove('selected'));
        if (selectedTheme) card.classList.add('selected');
      });
    });
  }

  div.querySelector('#wsGenerateBtn').addEventListener('click', async () => {
    const btn = div.querySelector('#wsGenerateBtn');
    btn.disabled = true;
    btn.textContent = '⏳ Preparing…';
    try {
      await generateWorksheetPDF(sections, selectedTheme);
    } catch (err) {
      document.getElementById('wsStatus').textContent = 'Error generating PDF. Please try again.';
      console.error(err);
    } finally {
      btn.disabled = false;
      btn.textContent = '📄 Download PDF';
    }
  });

  return div;
}

async function generateWorksheetPDF(sections, theme = null) {
  const statusEl = document.getElementById('wsStatus');
  if (!window.jspdf) {
    statusEl.textContent = 'PDF library not loaded — please try again in a moment.';
    return;
  }
  statusEl.textContent = '';

  const wordCount = Math.max(1, parseInt(document.getElementById('ws-word-count').value, 10) || 25);
  const selectedLevels = Array.from(document.querySelectorAll('.ws-level-cb:checked')).map(cb => cb.value);
  const includeNotes = document.getElementById('wsIncludeNotes').checked;
  const mixAll = document.getElementById('wsMixAll').checked;

  const renderBlocks = [];

  if (mixAll) {
    let words = [];
    for (const sec of sections) {
      const checkedItems = Array.from(
        document.querySelectorAll(`.ws-item-cb[data-sec="${sec.id}"]:checked`)
      ).map(cb => cb.dataset.item);
      for (const item of sec.items) {
        if (!checkedItems.includes(item.id)) continue;
        for (const wObj of item.words) {
          if (!selectedLevels.length || selectedLevels.includes(wObj.level || 'easy')) {
            words.push({ word: wObj.word, emoji: getEmoji(wObj, item, sec) });
          }
        }
      }
    }
    if (words.length) {
      words = shuffle(words).slice(0, wordCount);
      renderBlocks.push({ label: 'Mixed Practice', rgb: hexToRgb('#9C27B0'), words, tn: null });
    }
  } else {
    for (const sec of sections) {
      const checkedItems = Array.from(
        document.querySelectorAll(`.ws-item-cb[data-sec="${sec.id}"]:checked`)
      ).map(cb => cb.dataset.item);
      if (checkedItems.length === 0) continue;

      if (includeNotes) {
        for (const item of sec.items) {
          if (!checkedItems.includes(item.id)) continue;
          let words = item.words
            .filter(w => !selectedLevels.length || selectedLevels.includes(w.level || 'easy'))
            .map(w => ({ word: w.word, emoji: getEmoji(w, item, sec) }));
          if (!words.length) continue;
          words = shuffle(words).slice(0, wordCount);
          renderBlocks.push({ label: item.label, rgb: hexToRgb(sec.color), words, tn: item.teacherNotes || null });
        }
      } else {
        let words = [];
        for (const item of sec.items) {
          if (checkedItems.includes(item.id)) {
            for (const wObj of item.words) {
              if (!selectedLevels.length || selectedLevels.includes(wObj.level || 'easy')) {
                words.push({ word: wObj.word, emoji: getEmoji(wObj, item, sec) });
              }
            }
          }
        }
        if (!words.length) continue;
        words = shuffle(words).slice(0, wordCount);
        renderBlocks.push({ label: sec.title, rgb: hexToRgb(sec.color), words, tn: null });
      }
    }
  }

  if (renderBlocks.length === 0) {
    statusEl.textContent = 'Please select at least one category!';
    return;
  }

  statusEl.textContent = 'Loading emoji…';
  const allEmoji = [...new Set(renderBlocks.flatMap(b => b.words.map(w => w.emoji)))];
  await Promise.all(allEmoji.map(e => loadEmojiImage(e)));
  if (theme) await Promise.all(theme.emoji.map(e => loadEmojiImage(e)));
  statusEl.textContent = '';

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'letter', orientation: 'portrait' });

  const pageW = 215.9, pageH = 279.4;
  const mL = 15, mT = 20, mB = 15;
  const workW = pageW - mL * 2;
  const cols = 4;
  const gapX = 3;
  const cellW = (workW - gapX * (cols - 1)) / cols;
  const cellH = 26;
  const gapY = 3;
  const hdrH = 9;
  const emojiSz = 9;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text("Nyra's Spelling Worksheet", pageW / 2, mT, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  doc.text(today, pageW / 2, mT + 6, { align: 'center' });
  doc.setFontSize(9);
  doc.setTextColor(130, 130, 130);
  doc.text('Name: _________________________', mL, mT + 13);
  doc.setTextColor(0, 0, 0);

  let y = mT + 20;

  for (const { label, rgb, words, tn } of renderBlocks) {
    const [rr, gg, bb] = rgb;

    let notesBoxH = 0;
    let rendNoteLines = null;
    if (tn) {
      const noteFields = [
        ['Rule', tn.simpleRule],
        ['Indian tip', tn.indianDadTip],
        ['Watch out', tn.commonMistake],
      ].filter(([, v]) => v);
      if (noteFields.length > 0) {
        const nFontSz = 7.5, nLH = 4, nPadV = 2.5, nPadH = 3;
        doc.setFontSize(nFontSz);
        rendNoteLines = noteFields.map(([lbl, txt]) => ({
          label: lbl + ':',
          body: doc.splitTextToSize(txt, workW - nPadH * 2 - 10),
        }));
        const totalL = rendNoteLines.reduce((s, r) => s + 1 + r.body.length, 0);
        notesBoxH = nPadV * 2 + totalL * nLH + 3;
      }
    }

    if (y + hdrH + notesBoxH + cellH + gapY > pageH - mB) {
      doc.addPage();
      y = mT;
    }

    doc.setFillColor(rr, gg, bb);
    doc.roundedRect(mL, y, workW, hdrH, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(label, mL + 4, y + hdrH * 0.68);
    doc.setTextColor(0, 0, 0);
    y += hdrH + 2;

    if (rendNoteLines) {
      const nFontSz = 7.5, nLH = 4, nPadV = 2.5, nPadH = 3;
      const totalL = rendNoteLines.reduce((s, r) => s + 1 + r.body.length, 0);
      const boxH = nPadV * 2 + totalL * nLH;

      doc.setFillColor(242, 245, 255);
      doc.setDrawColor(140, 160, 200);
      doc.setLineWidth(0.25);
      doc.rect(mL, y, workW, boxH, 'FD');

      let cy = y + nPadV + nLH * 0.82;
      doc.setFontSize(nFontSz);
      for (const { label: lbl, body } of rendNoteLines) {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(60, 80, 160);
        doc.text(lbl, mL + nPadH, cy);
        cy += nLH;
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(40, 40, 50);
        for (const line of body) {
          doc.text(line, mL + nPadH + 8, cy);
          cy += nLH;
        }
      }
      y += boxH + 3;
    }

    const rowCount = Math.ceil(words.length / cols);
    for (let row = 0; row < rowCount; row++) {
      if (y + cellH > pageH - mB) {
        doc.addPage();
        y = mT;
      }
      for (let col = 0; col < cols; col++) {
        const idx = row * cols + col;
        if (idx >= words.length) break;
        const { word, emoji } = words[idx];
        const x = mL + col * (cellW + gapX);

        const imgData = emojiCache.get(emoji);
        if (imgData) {
          const ex = x + (cellW - emojiSz) / 2;
          doc.addImage(imgData, 'PNG', ex, y + 1, emojiSz, emojiSz);
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(20, 20, 20);
        doc.text(word, x + 2, y + 15);

        doc.setDrawColor(185, 185, 185);
        doc.setLineWidth(0.3);
        doc.line(x + 2, y + 22, x + cellW - 2, y + 22);
      }
      y += cellH + gapY;
    }
    y += 5;
  }

  drawCornerStickers(doc, theme, pageW, pageH);

  const dateStr = new Date().toISOString().slice(0, 10);
  doc.save(`Nyra-Worksheet-${dateStr}.pdf`);
}

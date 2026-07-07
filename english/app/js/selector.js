import { getEmoji } from './emoji.js';
import { shuffle, roundToNearestMultiple } from './utils.js';

export function buildSelectorHTML(sections, prefix, opts = {}) {
  const {
    defaultCount = 25,
    minCount = 1,
    maxCount = 200,
    countLabel = 'Words per category:',
    showCount = true,
  } = opts;
  let html = `<div id="${prefix}-categories">`;
  for (const sec of sections) {
    html += `<div class="ws-section-box">
      <div class="ws-section-header">
        <label class="ws-sec-check-wrap">
          <input type="checkbox" class="${prefix}-sec-cb" data-sec="${sec.id}" checked>
          <span class="ws-color-dot" style="background:${sec.color}"></span>
          <span class="ws-section-name">${sec.title}</span>
        </label>
        <button class="ws-expand-btn" data-sec="${sec.id}" type="button">&#9654;</button>
      </div>
      <div class="ws-items-list" id="${prefix}-items-${sec.id}" hidden>`;
    for (const item of sec.items) {
      html += `<label class="ws-item-label">
          <input type="checkbox" class="${prefix}-item-cb" data-sec="${sec.id}" data-item="${item.id}" checked>
          ${item.label}
        </label>`;
    }
    html += `</div></div>`;
  }
  html += `</div>
  <div class="ws-level-row">
    <span>Levels:</span>
    <label class="ws-level-cb-label"><input type="checkbox" class="${prefix}-level-cb" value="easy" checked> ⭐ Easy</label>
    <label class="ws-level-cb-label"><input type="checkbox" class="${prefix}-level-cb" value="medium" checked> ⭐⭐ Medium</label>
    <label class="ws-level-cb-label"><input type="checkbox" class="${prefix}-level-cb" value="hard"> ⭐⭐⭐ Hard</label>
  </div>`;
  if (showCount) {
    html += `<div class="ws-count-row">
    <span id="${prefix}-count-label">${countLabel}</span>
    <input type="number" id="${prefix}-word-count" value="${defaultCount}" min="${minCount}" max="${maxCount}">
  </div>`;
  }
  return html;
}

export function setupSelector(containerEl, prefix) {
  containerEl.querySelectorAll('.ws-expand-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const itemsList = document.getElementById(`${prefix}-items-${btn.dataset.sec}`);
      if (!itemsList) return;
      const opening = itemsList.hidden;
      itemsList.hidden = !opening;
      btn.classList.toggle('open', opening);
    });
  });
  containerEl.querySelectorAll(`.${prefix}-sec-cb`).forEach(cb => {
    cb.addEventListener('change', () => {
      containerEl.querySelectorAll(`.${prefix}-item-cb[data-sec="${cb.dataset.sec}"]`).forEach(icb => {
        icb.checked = cb.checked;
      });
    });
  });
}

export function getSelectorWords(sections, containerEl, prefix, { playerCount = 1 } = {}) {
  const selectedLevels = Array.from(
    containerEl.querySelectorAll(`.${prefix}-level-cb:checked`)
  ).map(cb => cb.value);
  let wordCount = Math.max(1, parseInt(containerEl.querySelector(`#${prefix}-word-count`).value, 10) || 5);
  if (playerCount > 1) wordCount = roundToNearestMultiple(wordCount, playerCount);
  let words = [];
  for (const sec of sections) {
    const checkedItems = Array.from(
      containerEl.querySelectorAll(`.${prefix}-item-cb[data-sec="${sec.id}"]:checked`)
    ).map(cb => cb.dataset.item);
    for (const item of sec.items) {
      if (!checkedItems.includes(item.id)) continue;
      for (const wObj of item.words) {
        if (!selectedLevels.length || selectedLevels.includes(wObj.level || 'easy')) {
          words.push({ word: wObj.word, emoji: getEmoji(wObj, item, sec), level: wObj.level || 'easy', itemId: item.id });
        }
      }
    }
  }
  return shuffle(words).slice(0, wordCount);
}

function flattenSelectorItems(sections, containerEl, prefix, itemKey) {
  const selectedLevels = Array.from(
    containerEl.querySelectorAll(`.${prefix}-level-cb:checked`)
  ).map(cb => cb.value);
  const results = [];
  for (const sec of sections) {
    const checkedItemIds = Array.from(
      containerEl.querySelectorAll(`.${prefix}-item-cb[data-sec="${sec.id}"]:checked`)
    ).map(cb => cb.dataset.item);
    for (const item of sec.items) {
      if (!checkedItemIds.includes(item.id)) continue;
      for (const obj of (item[itemKey] || [])) {
        if (!selectedLevels.length || selectedLevels.includes(obj.level || 'easy')) {
          results.push({ obj, item, sec });
        }
      }
    }
  }
  return results;
}

export function getSelectorSentences(sections, containerEl, prefix) {
  const items = flattenSelectorItems(sections, containerEl, prefix, 'sentences');
  return shuffle(items.map(({ obj }) => ({ words: obj.words, level: obj.level || 'easy' })));
}

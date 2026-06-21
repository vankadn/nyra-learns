import { playChime } from '../audio/tones.js';
import { buildSelectorHTML, setupSelector, getSelectorWords } from '../selector.js';
import { showGames } from '../nav.js';

export function celebrate(playElId, title, subtitle, onPlayAgain) {
  const playEl = document.getElementById(playElId);
  if (!playEl) return;
  playChime(784, 0.15);
  setTimeout(() => playChime(988, 0.15), 160);
  setTimeout(() => playChime(1175, 0.3), 300);
  const colors = ['#FFD54F','#9C27B0','#1565C0','#43A047','#E53935','#FF7043'];
  for (let i = 0; i < 60; i++) {
    const p = document.createElement('div');
    p.className = 'g1-confetti-piece';
    p.style.cssText = `left:${Math.random()*100}vw;top:0;background:${colors[i % colors.length]};` +
      `width:${6+Math.random()*8}px;height:${6+Math.random()*8}px;` +
      `animation-duration:${1.5+Math.random()*2}s;animation-delay:${Math.random()*0.5}s;`;
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 3500);
  }
  const btnId = playElId + '-again';
  playEl.innerHTML = `
    <div class="g1-celebrate-card">
      <div style="font-size:4rem;margin-bottom:8px;">🎉</div>
      <div style="font-family:'Baloo 2',cursive;font-size:2rem;color:var(--plum);margin-bottom:6px;">${title}</div>
      <div style="font-family:'Baloo 2',cursive;font-size:1.1rem;color:#555;margin-bottom:20px;">${subtitle} Shabash! ⭐</div>
      <button class="next-btn" id="${btnId}">🔄 Play Again!</button>
    </div>`;
  document.getElementById(btnId).addEventListener('click', onPlayAgain);
}

export function renderGameSection({ sections, id, prefix, icon, title, tip, pdfFn, startFn }) {
  const div = document.createElement('div');
  div.id = `sec-${id}`;
  div.className = 'section';
  div.innerHTML = `
    <button class="back-btn" id="${prefix}BackBtn">← Games</button>
    <div class="section-title">${icon} ${title}</div>
    <div id="${prefix}-setup">
      <div class="tip">${tip}</div>
      ${buildSelectorHTML(sections, prefix, { defaultCount: 5, minCount: 2, maxCount: 10, countLabel: 'Words per round:' })}
      <div style="display:flex;gap:10px;margin-top:14px;">
        <button class="next-btn" id="${prefix}StartBtn" style="flex:1;">▶️ Start Game!</button>
        <button class="next-btn" id="${prefix}PdfBtn" style="flex:1;background:#2E7D32;box-shadow:0 5px 0 #1B5E20;">📄 Get PDF</button>
      </div>
      <div id="${prefix}SetupErr" class="ws-status"></div>
    </div>
    <div id="${prefix}-play" style="display:none;"></div>
  `;
  setupSelector(div, prefix);

  div.querySelector(`#${prefix}BackBtn`).addEventListener('click', () => showGames());

  div.querySelector(`#${prefix}StartBtn`).addEventListener('click', () => {
    const words = getSelectorWords(sections, div, prefix);
    const err = div.querySelector(`#${prefix}SetupErr`);
    if (!words.length) { err.textContent = 'No words found — try selecting more categories or levels!'; return; }
    err.textContent = '';
    startFn(div, words);
  });

  div.querySelector(`#${prefix}PdfBtn`).addEventListener('click', async () => {
    const words = getSelectorWords(sections, div, prefix);
    const err = div.querySelector(`#${prefix}SetupErr`);
    if (!words.length) { err.textContent = 'No words found — try selecting more categories or levels!'; return; }
    err.textContent = '';
    const btn = div.querySelector(`#${prefix}PdfBtn`);
    btn.disabled = true; btn.textContent = '⏳ Preparing…';
    try { await pdfFn(words); }
    catch (e) { err.textContent = 'PDF error: ' + e.message; console.error(e); }
    finally { btn.disabled = false; btn.textContent = '📄 Get PDF'; }
  });

  return div;
}

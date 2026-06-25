import { renderVowelSection, renderTeamsSection } from './learn.js';
import { buildQuizData, renderQuizSection } from './quiz.js';
import { renderGame1Section } from './games/letter-builder.js';
import { renderGame2Section } from './games/word-match.js';
import { renderGame3Section } from './games/missing-letter.js';
import { renderGame4Section } from './games/unscramble.js';
import { renderGame5Section } from './games/sentence-builder.js';
import { renderWorksheetSection } from './pdf/worksheet-pdf.js';
import { initNav, showLearnTab, showGames, showTab, renderGamesSection } from './nav.js';

async function init() {
  const res = await fetch('data/vowels.json');
  const DATA = await res.json();

  initNav(DATA.sections[0].id);

  const tabBar = document.getElementById('tabBar');
  const content = document.getElementById('content');
  const shortVowelColor = DATA.sections[0].color;

  DATA.sections.forEach((sec, i) => {
    const btn = document.createElement('button');
    btn.id = 'btn-' + sec.id;
    btn.className = 'tab-btn' + (i === 0 ? ' active' : '');
    btn.style.background = sec.color;
    btn.textContent = sec.icon + ' ' + sec.title;
    btn.addEventListener('click', () => showLearnTab(sec.id));
    tabBar.appendChild(btn);

    let secEl;
    if (sec.items && sec.items[0] && sec.items[0].sound !== undefined) {
      secEl = renderTeamsSection(sec);
    } else {
      secEl = renderVowelSection(sec, shortVowelColor);
    }
    if (i === 0) secEl.classList.add('active');
    content.appendChild(secEl);
  });

  const gamesBtn = document.createElement('button');
  gamesBtn.id = 'btn-games';
  gamesBtn.className = 'tab-btn';
  gamesBtn.style.background = '#6A1B9A';
  gamesBtn.textContent = '🎮 Games';
  gamesBtn.addEventListener('click', () => showGames());
  tabBar.appendChild(gamesBtn);

  const wsBtn = document.createElement('button');
  wsBtn.id = 'btn-worksheet';
  wsBtn.className = 'tab-btn';
  wsBtn.style.background = '#2E7D32';
  wsBtn.textContent = 'Worksheet';
  wsBtn.addEventListener('click', () => showTab('worksheet'));
  tabBar.appendChild(wsBtn);

  const praises = DATA.completionPraises || [];
  const stickerThemes = DATA.stickerThemes || [];
  content.appendChild(renderGamesSection());
  content.appendChild(renderQuizSection(buildQuizData(DATA.sections), DATA.sections));
  content.appendChild(renderGame1Section(DATA.sections, praises, stickerThemes));
  content.appendChild(renderGame2Section(DATA.sections, praises, stickerThemes));
  content.appendChild(renderGame3Section(DATA.sections, praises, stickerThemes));
  content.appendChild(renderGame4Section(DATA.sections, praises, stickerThemes));
  content.appendChild(renderGame5Section(DATA.sections, praises, stickerThemes));
  content.appendChild(renderWorksheetSection(DATA.sections, stickerThemes));
}

init();

import { renderVowelSection, renderTeamsSection } from './learn.js';
import { buildQuizData, renderQuizSection } from './quiz.js';
import { renderGame1Section } from './games/letter-builder.js';
import { renderGame2Section } from './games/word-match.js';
import { renderMissingLetterSection, buildMissingLetterGameCard } from './games/missing-letter.js';
import { renderGame4Section } from './games/unscramble.js';
import { renderGame5Section } from './games/sentence-builder.js';
import { renderSoundSortSection, buildSoundSortGameCard } from './games/sound-sort.js';
import { buildSoundSortConfigs } from './games/sound-sort-config.js';
import { renderSpellingChoiceSection, buildSpellingChoiceGameCard } from './games/spelling-choice.js';
import { renderClapCounterSection, buildClapCounterGameCard } from './games/clap-counter.js';
import { renderSyllableBuilderSection, buildSyllableBuilderGameCard } from './games/syllable-builder.js';
import { renderReadingPassagesSection, buildReadingPassagesGameCard } from './games/reading-passage.js';
import { renderWorksheetSection } from './pdf/worksheet-pdf.js';
import { initNav, showLearnTab, showGames, showTab, renderGamesSection } from './nav.js';

async function init() {
  const res = await fetch('data/vowels.json');
  const DATA = await res.json();
  const soundSortRes = await fetch('data/sound-sort-games.json');
  const soundSortManifest = await soundSortRes.json();
  const spellingChoiceRes = await fetch('data/spelling-choice.json');
  const spellingChoiceData = await spellingChoiceRes.json();
  const syllablesRes = await fetch('data/syllables.json');
  const syllablesData = await syllablesRes.json();
  const singleConsonantSoundsRes = await fetch('data/singleConsonantSounds.json');
  const singleConsonantSoundsData = (await singleConsonantSoundsRes.json()).singleConsonantSounds || [];
  const readingPassagesRes = await fetch('data/readingPassages.json');
  const readingPassagesData = (await readingPassagesRes.json()).readingPassages || [];

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
  const gamesGrid = content.querySelector('#sec-games .games-grid');

  content.appendChild(renderQuizSection(buildQuizData(DATA.sections), DATA.sections));
  content.appendChild(renderGame1Section(DATA.sections, praises, stickerThemes));
  content.appendChild(renderGame2Section(DATA.sections, praises, stickerThemes));
  content.appendChild(renderGame4Section(DATA.sections, praises, stickerThemes));
  content.appendChild(renderGame5Section(DATA.sections, praises, stickerThemes));
  content.appendChild(renderWorksheetSection(DATA.sections, stickerThemes));

  content.appendChild(renderSpellingChoiceSection(spellingChoiceData, praises));
  gamesGrid.appendChild(buildSpellingChoiceGameCard());

  content.appendChild(renderClapCounterSection(syllablesData, praises));
  gamesGrid.appendChild(buildClapCounterGameCard());

  content.appendChild(renderSyllableBuilderSection(syllablesData, praises));
  gamesGrid.appendChild(buildSyllableBuilderGameCard());

  content.appendChild(renderReadingPassagesSection(readingPassagesData));
  gamesGrid.appendChild(buildReadingPassagesGameCard());

  // Missing Letter: gameId 'game3' is the original game (its Games-grid card
  // is the static markup in nav.js, wired to showGame('game3') already) —
  // 'missing-letter-start'/'-end' are new, config-driven instances against
  // singleConsonantSounds.json's flat word list, each always blanking the
  // first/last letter (blankMode) instead of a random count by level. See
  // missing-letter.js for the blankMode-driven refactor.
  const consonantWordsSection = {
    id: 'single-consonant-sounds',
    title: 'Consonant Words',
    color: '#4A90D9',
    defaultEmoji: '🔤',
    items: [{
      id: 'consonant-words',
      label: 'Consonant Words',
      defaultEmoji: '🔤',
      words: singleConsonantSoundsData.map(w => ({ word: w.word, emoji: w.emoji, level: 'easy' })),
    }],
  };
  const missingLetterConfigs = [
    { gameId: 'game3', prefix: 'g3', icon: '✏️', title: 'Missing Letter',
      tip: '🎮 Fill in the missing letters to complete each word!',
      sections: DATA.sections, blankMode: 'byLevel' },
    { gameId: 'missing-letter-start', prefix: 'g3s', icon: '🔡', title: 'Missing Letter: Start',
      tip: '🎮 Fill in the missing first letter of each word!',
      sections: [consonantWordsSection], blankMode: 'start' },
    { gameId: 'missing-letter-end', prefix: 'g3e', icon: '🔚', title: 'Missing Letter: End',
      tip: '🎮 Fill in the missing last letter of each word!',
      sections: [consonantWordsSection], blankMode: 'end' },
  ];
  for (const cfg of missingLetterConfigs) {
    content.appendChild(renderMissingLetterSection(cfg, praises, stickerThemes));
    if (cfg.gameId !== 'game3') gamesGrid.appendChild(buildMissingLetterGameCard(cfg));
  }

  // Sound Sort: one game instance per manifest entry — adding a new
  // sound-classification game (e.g. Hard/Soft C) only needs a new entry
  // in sound-sort-games.json, no changes here. A manifest entry may source
  // its deck from a vowels.json section (sectionId), a Spelling Choice set
  // (setId) whose per-word `answer` field already carries the category,
  // syllables.json's flat tiers (tiers/challengeTier), or a curated subset
  // of singleConsonantSounds.json grouped by a per-word field (groupBy) —
  // either way the word list is never hand-duplicated into
  // sound-sort-games.json.
  const soundSortConfigs = buildSoundSortConfigs(
    DATA.sections, soundSortManifest.games || [], spellingChoiceData.sets || [], syllablesData, singleConsonantSoundsData
  );
  for (const cfg of soundSortConfigs) {
    content.appendChild(renderSoundSortSection(cfg, praises, stickerThemes));
    gamesGrid.appendChild(buildSoundSortGameCard(cfg));
  }
}

init();

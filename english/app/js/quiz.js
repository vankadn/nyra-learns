import { shuffle } from './utils.js';
import { speak } from './audio/tts.js';
import { showGames } from './nav.js';
import { getEmoji, DEFAULT_EMOJI } from './emoji.js';
import {
  buildPlayersSetupHTML, setupPlayersUI, startPlayersRound,
  getPlayersState, renderPlayerBar, creditCurrentPlayer, advanceTurn,
} from './players.js';

const PREFIX = 'quiz';

let currentQ = 0, score = 0, total = 0, answered = false, shuffledQuiz = [];
let quizSectionEl = null;
let iconByTitle = {};

export function buildQuizData(sections) {
  const titles = sections.map(s => s.title);
  const qs = [];
  for (const sec of sections) {
    for (const item of sec.items) {
      for (const wObj of item.words) {
        const wrong = shuffle(titles.filter(t => t !== sec.title)).slice(0, 3);
        qs.push({
          topic: sec.id,
          level: wObj.level || 'easy',
          word: wObj.word,
          emoji: getEmoji(wObj, item, sec),
          answer: sec.title,
          options: shuffle([sec.title, ...wrong]),
        });
      }
    }
  }
  return qs;
}

export function renderQuizSection(quizData, sections) {
  const div = document.createElement('div');
  div.id = 'sec-quiz';
  div.className = 'section';
  quizSectionEl = div;
  iconByTitle = Object.fromEntries(sections.map(s => [s.title, s.icon || DEFAULT_EMOJI]));

  let html = `<button class="back-btn" id="quizBackBtn">← Games</button>
  <div class="section-title">⭐ Quiz Time!</div>
  <div id="quizSetup">
    <div class="tip">👆 Pick what you want to practice today!</div>
    <div style="display:grid;gap:10px;margin-bottom:4px;">`;

  for (const sec of sections) {
    const eg = sec.items.slice(0, 3).flatMap(i => i.words.slice(0, 2).map(w => w.word)).join(', ');
    html += `<label class="topic-card" style="border-color:${sec.color}">
      <input type="checkbox" class="quiz-topic-cb" value="${sec.id}" checked>
      <span class="topic-icon">${sec.icon}</span>
      <span class="topic-name">${sec.title}</span>
      <span class="topic-eg">${eg}</span>
    </label>`;
  }

  html += `</div>
    <div class="level-pick-row">
      <span>Level:</span>
      <button class="lvl-btn on-easy"  data-level="easy">⭐ Easy</button>
      <button class="lvl-btn"          data-level="medium">⭐⭐ Medium</button>
      <button class="lvl-btn"          data-level="hard">⭐⭐⭐ Hard</button>
    </div>
    ${buildPlayersSetupHTML(PREFIX)}
    <button class="next-btn" id="startQuizBtn">▶️ Start Quiz!</button>
    <div id="topicWarning" style="color:#E53935;font-weight:700;text-align:center;margin-top:8px;display:none;">
      Please pick at least one topic and level! 🙏
    </div>
  </div>

  <div id="quizPlay" style="display:none;">
    <div class="quiz-play-top">
      <button id="changeTopicsBtn" class="quiz-change-btn">⬅️ Change</button>
    </div>
    <div class="score-bar" id="quizSoloBar">
      <span>⭐ Score</span>
      <span class="score-num" id="scoreDisplay">0</span>
      <span>/ <span id="totalDisplay">0</span></span>
    </div>
    <div id="${PREFIX}-plyr-bar" style="display:none;"></div>
    <div class="quiz-card">
      <div class="quiz-question">Which group does this word belong to?</div>
      <div class="quiz-picture" id="quizPicture"></div>
      <div class="quiz-word" id="quizWord"></div>
      <div class="quiz-options" id="quizOptions"></div>
      <div class="quiz-result" id="quizResult"></div>
    </div>
    <button class="next-btn" id="nextQuizBtn">Next Word ➡️</button>
  </div>`;

  div.innerHTML = html;
  setupPlayersUI(div, PREFIX);

  div.querySelector('#quizBackBtn').addEventListener('click', () => showGames());

  div.querySelectorAll('.lvl-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const classMap = { easy: 'on-easy', medium: 'on-medium', hard: 'on-hard' };
      btn.classList.toggle(classMap[btn.dataset.level]);
    });
  });

  div.querySelector('#startQuizBtn').addEventListener('click', () => startQuiz(quizData));
  div.querySelector('#changeTopicsBtn').addEventListener('click', backToSetup);
  div.querySelector('#nextQuizBtn').addEventListener('click', nextQuestion);

  return div;
}

function getSelectedTopics() {
  return Array.from(document.querySelectorAll('.quiz-topic-cb:checked')).map(cb => cb.value);
}

function getSelectedLevels() {
  const map = { 'on-easy': 'easy', 'on-medium': 'medium', 'on-hard': 'hard' };
  const levels = [];
  document.querySelectorAll('.lvl-btn').forEach(btn => {
    for (const [cls, lvl] of Object.entries(map)) {
      if (btn.classList.contains(cls)) levels.push(lvl);
    }
  });
  return levels;
}

function startQuiz(quizData) {
  const topics = getSelectedTopics();
  const levels = getSelectedLevels();
  if (topics.length === 0 || levels.length === 0) {
    document.getElementById('topicWarning').style.display = 'block';
    return;
  }
  document.getElementById('topicWarning').style.display = 'none';
  shuffledQuiz = shuffle(quizData.filter(q => topics.includes(q.topic) && levels.includes(q.level)));
  if (shuffledQuiz.length === 0) {
    const w = document.getElementById('topicWarning');
    w.style.display = 'block';
    w.textContent = 'No words found for this combo — try adding more levels!';
    return;
  }
  currentQ = 0; score = 0; total = 0; answered = false;
  startPlayersRound(quizSectionEl, PREFIX);
  updateScoreboardMode();
  updateScore();
  document.getElementById('quizSetup').style.display = 'none';
  document.getElementById('quizPlay').style.display = 'block';
  renderQuestion();
}

function backToSetup() {
  document.getElementById('quizSetup').style.display = 'block';
  document.getElementById('quizPlay').style.display = 'none';
}

function updateScoreboardMode() {
  const hasPlayers = getPlayersState(PREFIX).players.length > 0;
  document.getElementById('quizSoloBar').style.display = hasPlayers ? 'none' : 'flex';
  const bar = document.getElementById(`${PREFIX}-plyr-bar`);
  bar.style.display = hasPlayers ? 'block' : 'none';
  bar.innerHTML = renderPlayerBar(PREFIX);
}

function renderQuestion() {
  if (currentQ >= shuffledQuiz.length) currentQ = 0;
  const q = shuffledQuiz[currentQ];
  const picture = document.getElementById('quizPicture');
  picture.textContent = q.emoji;
  document.getElementById('quizWord').textContent = q.word;
  document.getElementById('quizResult').textContent = '';
  speak(q.word);
  answered = false;

  picture.onclick = () => speak(q.word);

  const container = document.getElementById('quizOptions');
  container.innerHTML = '';
  shuffle(q.options).forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'quiz-btn';
    btn.dataset.opt = opt;
    const icon = iconByTitle[opt] || DEFAULT_EMOJI;
    btn.innerHTML = `<span class="quiz-opt-icon">${icon}</span>${opt}`;
    btn.addEventListener('click', () => checkAnswer(btn, opt, q.answer, container));
    container.appendChild(btn);
  });
}

function checkAnswer(btn, chosen, correct, container) {
  if (answered) return;
  answered = true;
  total++;
  container.querySelectorAll('.quiz-btn').forEach(b => {
    b.disabled = true;
    if (b.dataset.opt === correct) b.classList.add('correct');
  });
  const result = document.getElementById('quizResult');
  const hasPlayers = getPlayersState(PREFIX).players.length > 0;
  if (chosen === correct) {
    if (hasPlayers) creditCurrentPlayer(PREFIX); else score++;
    btn.classList.add('correct');
    result.textContent = '🎉 Wah, correct! Shabash! 🌟';
    speak('Correct! Great job!');
  } else {
    btn.classList.add('wrong');
    result.textContent = 'Oops! It is ' + correct + '. Try again!';
    speak('The answer is ' + correct);
  }
  updateScore();
}

function nextQuestion() {
  advanceTurn(PREFIX);
  currentQ++;
  renderQuestion();
}

function updateScore() {
  document.getElementById('scoreDisplay').textContent = score;
  document.getElementById('totalDisplay').textContent = total;
}

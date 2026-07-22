import { escHtml, shuffle } from '../utils.js';
import { speak } from '../audio/tts.js';
import { showGames, showGame } from '../nav.js';

const VOWEL_LABELS = {
  'short-a': 'Short A', 'short-e': 'Short E', 'short-i': 'Short I',
  'short-o': 'Short O', 'short-u': 'Short U',
};

// Reading Passages: parent-led shared reading, not a competitive/turn-based
// drill — deliberately skips Player Select and any score-bar/quiz-shell
// reuse. One game card opens a list of passages (mirrors Spelling Choice's
// set-picker); picking one shows the passage text plus its questions in
// order, each rendered per its `type` (multiple-choice / short-answer /
// word-list) — see readingPassages.json.
export function renderReadingPassagesSection(passages = []) {
  const div = document.createElement('div');
  div.id = 'sec-reading-passages';
  div.className = 'section';

  div.innerHTML = `
    <button class="back-btn" id="rpBackBtn">← Games</button>
    <div class="section-title">📖 Reading Passages</div>
    <div id="rp-list">
      <div class="tip">👆 Pick a story to read together!</div>
      <div style="display:grid;gap:10px;margin-bottom:4px;">
        ${passages.map(p => `
          <div class="topic-card rp-passage-card" data-passage-id="${escHtml(p.id)}">
            <span class="topic-icon">📖</span>
            <span class="topic-name">${escHtml(p.title)}</span>
            <span class="topic-eg">${escHtml(VOWEL_LABELS[p.vowelSound] || p.vowelSound)}</span>
          </div>`).join('')}
      </div>
    </div>
    <div id="rp-play" style="display:none;"></div>
  `;

  div.querySelector('#rpBackBtn').addEventListener('click', () => showGames());
  div.querySelectorAll('.rp-passage-card').forEach(card => {
    card.addEventListener('click', () => {
      const passage = passages.find(p => p.id === card.dataset.passageId);
      if (passage) showPassage(passage);
    });
  });

  function backToList() {
    div.querySelector('#rp-list').style.display = 'block';
    div.querySelector('#rp-play').style.display = 'none';
  }

  function showPassage(passage) {
    div.querySelector('#rp-list').style.display = 'none';
    const playEl = div.querySelector('#rp-play');
    playEl.style.display = 'block';
    playEl.innerHTML = `
      <div class="quiz-play-top"><button class="quiz-change-btn" id="rpChangeBtn">⬅️ Change</button></div>
      <div class="rp-passage-title">${escHtml(passage.title)}</div>
      <div class="rp-passage-text" id="rp-text" title="Tap to hear it read aloud">${escHtml(passage.text)}</div>
      <div class="rp-questions" id="rp-questions"></div>
    `;
    playEl.querySelector('#rpChangeBtn').addEventListener('click', backToList);
    playEl.querySelector('#rp-text').addEventListener('click', () => speak(passage.text));
    renderQuestions(playEl.querySelector('#rp-questions'), passage);
  }

  function renderQuestions(container, passage) {
    container.innerHTML = passage.questions.map((q, i) => `<div class="rp-question" id="rp-q-${i}"></div>`).join('');
    passage.questions.forEach((q, i) => renderQuestion(container.querySelector(`#rp-q-${i}`), q));
  }

  function renderQuestion(el, q) {
    if (q.type === 'multiple-choice') {
      el.innerHTML = `
        <div class="rp-q-prompt">${escHtml(q.prompt)}</div>
        <div class="quiz-options rp-q-options"></div>
        <div class="quiz-result rp-q-result"></div>
      `;
      const optionsEl = el.querySelector('.rp-q-options');
      shuffle(q.choices).forEach(choice => {
        const btn = document.createElement('button');
        btn.className = 'quiz-btn';
        btn.textContent = choice;
        btn.addEventListener('click', () => {
          if (btn.disabled) return;
          const resultEl = el.querySelector('.rp-q-result');
          const correct = choice === q.answer;
          el.querySelectorAll('.quiz-btn').forEach(b => { b.disabled = true; });
          btn.classList.add(correct ? 'correct' : 'wrong');
          if (!correct) {
            Array.from(el.querySelectorAll('.quiz-btn'))
              .find(b => b.textContent === q.answer)?.classList.add('correct');
          }
          resultEl.textContent = correct ? '🎉 Yes!' : `Not quite — it's "${q.answer}"!`;
        });
        optionsEl.appendChild(btn);
      });
    } else if (q.type === 'short-answer') {
      el.innerHTML = `
        <div class="rp-q-prompt">${escHtml(q.prompt)}</div>
        <input type="text" class="rp-q-input" placeholder="Type or say the answer…">
        <button class="rp-q-reveal-btn">👀 Show Answer</button>
        <div class="rp-q-answer" style="display:none;">${escHtml(q.answer)}</div>
      `;
      el.querySelector('.rp-q-reveal-btn').addEventListener('click', function () {
        el.querySelector('.rp-q-answer').style.display = 'block';
      });
    } else if (q.type === 'word-list') {
      el.innerHTML = `
        <div class="rp-q-prompt">${escHtml(q.prompt)}</div>
        <div class="rp-q-chips">
          ${q.answer.map(w => `<button class="rp-chip" data-word="${escHtml(w)}">${escHtml(w)}</button>`).join('')}
        </div>
      `;
      el.querySelectorAll('.rp-chip').forEach(chip => {
        chip.addEventListener('click', () => chip.classList.toggle('found'));
      });
    }
  }

  return div;
}

export function buildReadingPassagesGameCard() {
  const card = document.createElement('div');
  card.className = 'game-card';
  card.id = 'gc-reading-passages';
  card.innerHTML = `
    <div class="game-card-icon">📖</div>
    <div class="game-card-name">Reading Passages</div>
    <div class="game-card-desc">Read a short story together and answer questions</div>
  `;
  card.addEventListener('click', () => showGame('reading-passages'));
  return card;
}

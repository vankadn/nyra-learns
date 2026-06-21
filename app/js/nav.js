let lastLearnTab = null;
let _defaultLearnTab = null;

export function initNav(defaultLearnTabId) {
  _defaultLearnTab = defaultLearnTabId;
}

export function showTab(id) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  const sec = document.getElementById('sec-' + id);
  if (sec) sec.classList.add('active');
  const btn = document.getElementById('btn-' + id);
  if (btn) btn.classList.add('active');
}

export function showLearnTab(id) {
  lastLearnTab = id;
  showTab(id);
}

export function showGames() {
  document.getElementById('tabBar').style.display = 'none';
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('btn-games').classList.add('active');
  document.getElementById('sec-games').classList.add('active');
}

export function showGame(id) {
  document.getElementById('tabBar').style.display = 'none';
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById('sec-' + id).classList.add('active');
}

export function showLearn(id) {
  document.getElementById('tabBar').style.display = '';
  showTab(id || lastLearnTab || _defaultLearnTab);
}

export function renderGamesSection() {
  const div = document.createElement('div');
  div.id = 'sec-games';
  div.className = 'section';
  div.innerHTML = `
    <button class="back-btn" id="gamesBackToLearn">← Back to Learning</button>
    <div class="section-title">🎮 Games</div>
    <div class="games-grid">
      <div class="game-card" id="gc-quiz">
        <div class="game-card-icon">⭐</div>
        <div class="game-card-name">Quiz</div>
        <div class="game-card-desc">Guess which vowel group each word belongs to</div>
      </div>
      <div class="game-card" id="gc-game1">
        <div class="game-card-icon">🔤</div>
        <div class="game-card-name">Letter Builder</div>
        <div class="game-card-desc">Spell words by dragging letter tiles into blanks</div>
      </div>
      <div class="game-card" id="gc-game2">
        <div class="game-card-icon">🔗</div>
        <div class="game-card-name">Word Match</div>
        <div class="game-card-desc">Connect each word to its matching picture</div>
      </div>
      <div class="game-card" id="gc-game3">
        <div class="game-card-icon">✏️</div>
        <div class="game-card-name">Missing Letter</div>
        <div class="game-card-desc">Fill in the missing letters to complete each word</div>
      </div>
      <div class="game-card" id="gc-game4">
        <div class="game-card-icon">🔀</div>
        <div class="game-card-name">Unscramble</div>
        <div class="game-card-desc">Put the jumbled letters back in the right order</div>
      </div>
      <div class="game-card" id="gc-game5">
        <div class="game-card-icon">🧩</div>
        <div class="game-card-name">Sentence Builder</div>
        <div class="game-card-desc">Put the words in order to build a sentence</div>
      </div>
    </div>
  `;
  div.querySelector('#gamesBackToLearn').addEventListener('click', () => showLearn());
  div.querySelector('#gc-quiz').addEventListener('click', () => showGame('quiz'));
  div.querySelector('#gc-game1').addEventListener('click', () => showGame('game1'));
  div.querySelector('#gc-game2').addEventListener('click', () => showGame('game2'));
  div.querySelector('#gc-game3').addEventListener('click', () => showGame('game3'));
  div.querySelector('#gc-game4').addEventListener('click', () => showGame('game4'));
  div.querySelector('#gc-game5').addEventListener('click', () => showGame('game5'));
  return div;
}

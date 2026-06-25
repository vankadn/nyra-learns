export function renderRootNav(containerId = 'root-nav') {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `
    <nav class="root-nav">
      <a href="english/app/" class="root-nav-link">📖 English (Phonics)</a>
      <span class="root-nav-soon">🎵 Music — coming soon</span>
    </nav>`;
}

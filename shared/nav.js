export function renderRootNav(containerId = 'root-nav') {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `
    <nav class="root-nav">
      <a href="english/app/" class="root-nav-link">📖 English (Phonics)</a>
      <a href="music/" class="root-nav-link">🎵 Music (Bhajans)</a>
    </nav>`;
}

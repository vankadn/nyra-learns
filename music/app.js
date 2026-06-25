import { CONFIG } from './config.js';

const CONFIGURED = !CONFIG.CLIENT_ID.startsWith('PASTE') && !CONFIG.BHAJANS_FOLDER_ID.startsWith('PASTE');
const BASE = 'https://www.googleapis.com/drive/v3';

let tokenClient, accessToken, currentUser;
const activeBlobUrls = [];

function trackBlob(url) { activeBlobUrls.push(url); return url; }

function revokeBlobs() {
  activeBlobUrls.forEach(u => URL.revokeObjectURL(u));
  activeBlobUrls.length = 0;
}

// --- Auth ---

function initAuth() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.CLIENT_ID,
    scope: 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/userinfo.profile',
    callback: () => {},
  });
}

function requestToken(opts = {}) {
  return new Promise((resolve, reject) => {
    tokenClient.callback = r =>
      r.error ? reject(new Error(r.error_description || r.error)) : (accessToken = r.access_token, resolve());
    tokenClient.requestAccessToken(opts);
  });
}

// --- Drive API ---

async function apiFetch(url) {
  let resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (resp.status === 401) {
    await requestToken({ prompt: '' });
    resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  }
  if (!resp.ok) throw new Error(`Drive API error ${resp.status}`);
  return resp;
}

const apiJSON = async path => (await apiFetch(`${BASE}/${path}`)).json();

async function makeBlobUrl(path) {
  const blob = await (await apiFetch(`${BASE}/${path}`)).blob();
  return trackBlob(URL.createObjectURL(blob));
}

// --- Rendering helpers ---

const app = () => document.getElementById('app');
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function userPillHtml() {
  if (!currentUser) return '';
  const avatar = currentUser.picture ? `<img src="${esc(currentUser.picture)}" class="user-avatar" alt="">` : '';
  return `<div class="user-pill">${avatar}<span>${esc(currentUser.name)}</span></div>`;
}

function setLoading(id, msg = 'Loading…') {
  const el = document.getElementById(id);
  if (el) el.innerHTML = `<span class="loading-inline">${msg}</span>`;
}

// --- Views ---

function showSignIn() {
  app().innerHTML = `
    <div class="sign-in-screen">
      <div class="sign-in-card">
        <div class="sign-in-icon">🎵</div>
        <h2>Nyra's Bhajan Practice</h2>
        <p>Sign in to listen to bhajans and practice takes</p>
        <button id="sign-in-btn" class="btn-primary">Sign in with Google</button>
      </div>
    </div>`;

  document.getElementById('sign-in-btn').onclick = async () => {
    const btn = document.getElementById('sign-in-btn');
    btn.disabled = true;
    btn.textContent = 'Signing in…';
    try {
      await requestToken();
      const info = await (await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })).json();
      currentUser = info;
      await showSongList();
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Sign in with Google';
      showError(e.message);
    }
  };
}

async function showSongList() {
  app().innerHTML = `<div class="loading">Loading songs…</div>`;
  revokeBlobs();
  try {
    const q = encodeURIComponent(
      `'${CONFIG.BHAJANS_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
    );
    const data = await apiJSON(`files?q=${q}&fields=files(id,name)&orderBy=name`);
    const songs = data.files || [];

    if (!songs.length) {
      app().innerHTML = `
        ${userPillHtml()}
        <div class="empty-state">
          <p>No bhajans found.</p>
          <p class="hint">Add a subfolder to the Bhajans folder in Drive to get started.</p>
        </div>`;
      return;
    }

    app().innerHTML = `
      ${userPillHtml()}
      <h2 class="section-heading">🎵 Bhajans</h2>
      <div class="song-grid">
        ${songs.map(s => `
          <div class="song-card" data-id="${esc(s.id)}" data-name="${esc(s.name)}">
            <div class="song-card-icon">🎶</div>
            <div class="song-card-name">${esc(s.name)}</div>
          </div>`).join('')}
      </div>`;

    app().querySelectorAll('.song-card').forEach(card =>
      card.addEventListener('click', () => showSong(card.dataset.id, card.dataset.name))
    );
  } catch (e) {
    showError(e.message);
  }
}

async function showSong(folderId, songName) {
  revokeBlobs();
  app().innerHTML = `
    <button class="back-btn" id="back-btn">← Bhajans</button>
    <h2 class="song-title">${esc(songName)}</h2>
    <div id="teacher-section" class="song-section">
      <h3 class="section-title">🎵 Teacher Reference</h3>
      <span id="teacher-status" class="loading-inline">Loading…</span>
    </div>
    <div id="student-section" class="song-section">
      <h3 class="section-title">🎤 Nyra's Practice</h3>
      <span id="student-status" class="loading-inline">Loading…</span>
    </div>`;

  document.getElementById('back-btn').addEventListener('click', () => showSongList());

  try {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    const data = await apiJSON(`files?q=${q}&fields=files(id,name)`);
    const files = data.files || [];
    const find = prefix => files.find(f => f.name.toLowerCase().startsWith(prefix.toLowerCase()));

    const teacherAudio   = find('teacher-audio');
    const teacherNotes   = find('teacher-notes');
    const studentFile    = find('student-practice');

    // Teacher section
    const teacherEl = document.getElementById('teacher-section');
    if (!teacherAudio && !teacherNotes) {
      document.getElementById('teacher-status').outerHTML = `<p class="hint">No teacher files in this folder yet.</p>`;
    } else {
      document.getElementById('teacher-status').remove();
      if (teacherAudio) {
        teacherEl.insertAdjacentHTML('beforeend', `<div id="ta-wrap"><span class="loading-inline">Loading audio…</span></div>`);
        makeBlobUrl(`files/${teacherAudio.id}?alt=media`).then(url => {
          document.getElementById('ta-wrap').innerHTML = `<audio controls src="${url}" class="audio-player"></audio>`;
        }).catch(() => {
          document.getElementById('ta-wrap').innerHTML = `<p class="hint">Could not load teacher audio.</p>`;
        });
      }
      if (teacherNotes) {
        teacherEl.insertAdjacentHTML('beforeend', `<div id="tn-wrap"><span class="loading-inline">Loading notes…</span></div>`);
        makeBlobUrl(`files/${teacherNotes.id}?alt=media`).then(url => {
          document.getElementById('tn-wrap').innerHTML = `<img src="${url}" class="notes-img" alt="Teacher notes">`;
        }).catch(() => {
          document.getElementById('tn-wrap').innerHTML = `<p class="hint">Could not load teacher notes image.</p>`;
        });
      }
    }

    // Student section
    const studentEl = document.getElementById('student-section');
    if (!studentFile) {
      document.getElementById('student-status').outerHTML = `<p class="hint">No practice take yet.</p>`;
      return;
    }

    const [latestUrl, revData] = await Promise.all([
      makeBlobUrl(`files/${studentFile.id}?alt=media`),
      apiJSON(`files/${studentFile.id}/revisions?fields=revisions(id,modifiedTime,keepForever)`),
    ]);

    const revisions = (revData.revisions || []).reverse(); // newest first
    const latestRevId = revisions[0]?.id;

    const DAY_MS = 86_400_000;
    let ageWarning = '';
    if (revisions[0] && !revisions[0].keepForever) {
      const ageDays = Math.floor((Date.now() - new Date(revisions[0].modifiedTime)) / DAY_MS);
      if (ageDays >= 25) {
        ageWarning = `<p class="age-warning">⚠️ This take is ${ageDays} days old — open Drive → version history → ⋮ → Keep forever to prevent auto-deletion.</p>`;
      }
    }

    const revOptions = revisions.map((r, i) => {
      const label = new Date(r.modifiedTime).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
      const flag = r.keepForever ? ' ✓' : '';
      return `<option value="${esc(r.id)}">${i === 0 ? `Latest — ${label}` : label}${flag}</option>`;
    }).join('');

    document.getElementById('student-status').remove();
    studentEl.insertAdjacentHTML('beforeend', `
      ${ageWarning}
      <audio controls id="student-audio" src="${latestUrl}" class="audio-player"></audio>
      ${revisions.length > 1 ? `
        <div class="revision-row">
          <label class="rev-label">Earlier takes:</label>
          <select id="rev-picker" class="rev-select">${revOptions}</select>
        </div>` : ''}`);

    if (revisions.length > 1) {
      let currentAudioUrl = latestUrl;
      document.getElementById('rev-picker').addEventListener('change', async function() {
        const revId = this.value;
        const audioEl = document.getElementById('student-audio');
        audioEl.removeAttribute('src');
        audioEl.load();
        this.disabled = true;

        // Revoke previous blob if it's not the latestUrl (which is tracked in activeBlobUrls)
        const prevUrl = currentAudioUrl;
        try {
          const url = revId === latestRevId
            ? latestUrl
            : await makeBlobUrl(`files/${studentFile.id}/revisions/${revId}?alt=media`);
          if (prevUrl !== latestUrl) URL.revokeObjectURL(prevUrl);
          currentAudioUrl = url;
          audioEl.src = url;
          audioEl.load();
        } catch (e) {
          showError(e.message);
        } finally {
          this.disabled = false;
        }
      });
    }

  } catch (e) {
    showError(e.message);
  }
}

function showError(msg) {
  const existing = document.getElementById('error-banner');
  if (existing) existing.remove();
  const banner = document.createElement('div');
  banner.id = 'error-banner';
  banner.className = 'error-banner';
  banner.innerHTML = `<span>⚠️ ${esc(msg)}</span><button onclick="this.parentElement.remove()">✕</button>`;
  document.getElementById('app').prepend(banner);
}

// --- Boot ---

function boot() {
  if (!CONFIGURED) {
    app().innerHTML = `
      <div class="setup-card">
        <h2>Setup required</h2>
        <p>Open <code>music/config.js</code> and fill in your OAuth Client ID and Bhajans Drive folder ID, then reload.</p>
      </div>`;
    return;
  }
  if (!window.google?.accounts?.oauth2) {
    app().innerHTML = `<div class="error-banner"><span>⚠️ Google Identity Services failed to load. Check your connection and reload.</span></div>`;
    return;
  }
  initAuth();
  showSignIn();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

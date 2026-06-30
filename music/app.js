import { CONFIG } from './config.js';

const CONFIGURED = !CONFIG.CLIENT_ID.startsWith('PASTE') && !CONFIG.BHAJANS_FOLDER_ID.startsWith('PASTE');
const BASE = 'https://www.googleapis.com/drive/v3';
const UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

let tokenClient, accessToken, currentUser;
const activeBlobUrls = [];

// Recording state
let _recorder = null, _recordingStream = null, _recordingChunks = [], _recordingTimer = null;

// Wizard state (null when not in wizard)
let wizard = null;

// Queue state (null when no queue active)
let queue = null;

// God filter state — persists for the session (survive revokeBlobs)
let godsFolderId = null;
let cachedGods = null;       // null=not fetched; array of { name, fileId, blobUrl }
let activeGodFilter = null;  // null=show all; string=god name to filter by
const godBlobUrls = [];      // separate from activeBlobUrls so they survive revokeBlobs()

function trackBlob(url) { activeBlobUrls.push(url); return url; }

function revokeBlobs() {
  activeBlobUrls.forEach(u => URL.revokeObjectURL(u));
  activeBlobUrls.length = 0;
}

async function makeGodBlobUrl(path) {
  const blob = await (await apiFetch(`${BASE}/${path}`)).blob();
  const url = URL.createObjectURL(blob);
  godBlobUrls.push(url);
  return url;
}

function getGodAvatar(god) {
  if (god.blobUrl) return { type: 'image', url: god.blobUrl };
  if (god.properties?.emoji) return { type: 'emoji', value: god.properties.emoji };
  return { type: 'emoji', value: '🛕' };
}

function godAvatarHtml(god, imgClass = 'god-chip-img') {
  const av = getGodAvatar(god);
  return av.type === 'image'
    ? `<img src="${esc(av.url)}" class="${imgClass}" alt="${esc(god.name)}">`
    : `<span class="god-emoji-avatar">${av.value}</span>`;
}

// --- Auth ---

function initAuth() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.CLIENT_ID,
    scope: 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/userinfo.profile',
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

async function apiPost(path, body) {
  const doFetch = () => fetch(`${BASE}/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let resp = await doFetch();
  if (resp.status === 401) { await requestToken({ prompt: '' }); resp = await doFetch(); }
  if (!resp.ok) throw new Error(`Drive API error ${resp.status}`);
  return resp.json();
}

// Multipart upload for create (POST) or update (PATCH). Always sets keepRevisionForever=true.
async function driveUpload(metadata, blob, fileId = null) {
  const boundary = `nyrabb${Date.now()}`;
  const head = new TextEncoder().encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: ${blob.type || 'application/octet-stream'}\r\n\r\n`
  );
  const tail = new TextEncoder().encode(`\r\n--${boundary}--`);
  const buf = await blob.arrayBuffer();
  const body = new Uint8Array(head.length + buf.byteLength + tail.length);
  body.set(head, 0);
  body.set(new Uint8Array(buf), head.length);
  body.set(tail, head.length + buf.byteLength);

  const url = fileId
    ? `${UPLOAD_BASE}/files/${fileId}?uploadType=multipart&keepRevisionForever=true`
    : `${UPLOAD_BASE}/files?uploadType=multipart&keepRevisionForever=true`;

  const doFetch = () => fetch(url, {
    method: fileId ? 'PATCH' : 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  let resp = await doFetch();
  if (resp.status === 401) { await requestToken({ prompt: '' }); resp = await doFetch(); }
  if (!resp.ok) { const t = await resp.text(); throw new Error(`Upload failed ${resp.status}: ${t}`); }
  return resp.json();
}

async function makeBlobUrl(path) {
  const blob = await (await apiFetch(`${BASE}/${path}`)).blob();
  return trackBlob(URL.createObjectURL(blob));
}

async function driveUpdateProperties(fileId, props) {
  const doFetch = () => fetch(`${BASE}/files/${fileId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ properties: props }),
  });
  let resp = await doFetch();
  if (resp.status === 401) { await requestToken({ prompt: '' }); resp = await doFetch(); }
  if (!resp.ok) throw new Error(`Drive API error ${resp.status}`);
  return resp.json();
}

async function ensureGodsFolderId() {
  if (godsFolderId) return godsFolderId;
  const q = encodeURIComponent(
    `'${CONFIG.BHAJANS_FOLDER_ID}' in parents and name='_Gods' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const data = await apiJSON(`files?q=${q}&fields=files(id)`);
  if (data.files && data.files.length) {
    godsFolderId = data.files[0].id;
  } else {
    const folder = await apiPost('files', {
      name: '_Gods',
      mimeType: 'application/vnd.google-apps.folder',
      parents: [CONFIG.BHAJANS_FOLDER_ID],
    });
    godsFolderId = folder.id;
  }
  return godsFolderId;
}

async function fetchGodsData() {
  if (cachedGods !== null) return cachedGods;
  try {
    const folderId = await ensureGodsFolderId();
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    const data = await apiJSON(`files?q=${q}&fields=files(id,name,mimeType,properties)&orderBy=name`);
    const files = data.files || [];
    const gods = await Promise.all(files.map(async f => {
      const name = f.name.includes('.') ? f.name.substring(0, f.name.lastIndexOf('.')) : f.name;
      let blobUrl = null;
      if (f.mimeType?.startsWith('image/')) {
        try { blobUrl = await makeGodBlobUrl(`files/${f.id}?alt=media`); } catch (_) {}
      }
      return { name, fileId: f.id, blobUrl, properties: f.properties || {} };
    }));
    cachedGods = gods;
    return gods;
  } catch (_) {
    cachedGods = [];
    return [];
  }
}

// --- Rendering helpers ---

const app = () => document.getElementById('app');
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function userPillHtml() {
  if (!currentUser) return '';
  const avatar = currentUser.picture ? `<img src="${esc(currentUser.picture)}" class="user-avatar" alt="">` : '';
  return `<div class="user-pill">${avatar}<span>${esc(currentUser.name)}</span></div>`;
}

function addContentBtnHtml() {
  return `<button class="add-content-btn" id="add-content-btn">+ Add content</button>`;
}

function godFilterRowHtml(gods) {
  const allActive = !activeGodFilter;
  const godChips = (gods || []).map(g => {
    const noPhoto = !g.blobUrl;
    return `
    <div class="god-chip-wrap">
      <button class="god-chip${activeGodFilter === g.name ? ' active' : ''}" data-god="${esc(g.name)}">
        <div class="god-chip-circle">
          ${godAvatarHtml(g)}
        </div>
        <span class="god-chip-label">${esc(g.name)}</span>
      </button>
      ${noPhoto ? `<button class="god-emoji-mini-btn" data-god-name="${esc(g.name)}" title="Set emoji">🖌️</button>` : ''}
    </div>`;
  }).join('');
  return `
    <div class="god-filter-row">
      <button class="god-chip god-chip-all${allActive ? ' active' : ''}" data-god="">
        <div class="god-chip-circle god-chip-all-circle">All</div>
        <span class="god-chip-label">All</span>
      </button>
      ${godChips}
      <button class="god-chip god-chip-add" id="god-add-btn">
        <div class="god-chip-circle god-chip-add-circle">+</div>
        <span class="god-chip-label">Add</span>
      </button>
    </div>`;
}

function wireGodFilter(songs, gods) {
  document.querySelectorAll('.god-chip[data-god]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeGodFilter = btn.dataset.god || null;
      document.querySelectorAll('.god-chip[data-god]').forEach(b =>
        b.classList.toggle('active', b.dataset.god === (activeGodFilter || ''))
      );
      document.querySelectorAll('.song-card').forEach(card => {
        const match = !activeGodFilter || card.dataset.god === activeGodFilter;
        card.style.display = match ? '' : 'none';
      });
    });
  });
  document.querySelectorAll('.god-emoji-mini-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const godName = btn.dataset.godName;
      const god = (cachedGods || []).find(g => g.name === godName);
      if (!god) return;
      const circle = btn.closest('.god-chip-wrap')?.querySelector('.god-chip-circle');
      if (circle) showEmojiInputInline(god, circle, () => { circle.innerHTML = godAvatarHtml(god); });
    });
  });
  const addBtn = document.getElementById('god-add-btn');
  if (addBtn) addBtn.onclick = () => showAddGodForm(null, songs, gods);
}

function typeLabel(type) {
  return type === 'teacher-audio' ? "Teacher's audio clip"
       : type === 'teacher-notes' ? "Teacher's notes (photo)"
       : "Nyra's practice take";
}

// --- Recording helpers ---

function stopActiveRecording() {
  if (_recorder && _recorder.state !== 'inactive') _recorder.stop();
  if (_recordingStream) { _recordingStream.getTracks().forEach(t => t.stop()); _recordingStream = null; }
  if (_recordingTimer) { clearInterval(_recordingTimer); _recordingTimer = null; }
  _recorder = null;
}

// --- Queue ---

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function stopQueue() {
  if (!queue) return;
  if (queue.currentBlobUrl) {
    URL.revokeObjectURL(queue.currentBlobUrl);
    const idx = activeBlobUrls.indexOf(queue.currentBlobUrl);
    if (idx !== -1) activeBlobUrls.splice(idx, 1);
  }
  queue = null;
  const bar = document.getElementById('queue-bar');
  if (bar) bar.innerHTML = '';
}

function queueTrackLabel(track, cursor, total) {
  const pos = `${cursor + 1} of ${total}`;
  const name = queue?.showType
    ? `${esc(track.songName)} (${track.type === 'teacher' ? 'teacher' : 'Nyra'})`
    : esc(track.songName);
  return `${name} — ${pos}`;
}

function updateQueueNav() {
  const prev = document.getElementById('queue-prev');
  const next = document.getElementById('queue-next');
  if (prev) prev.disabled = !queue || queue.cursor <= 0;
  if (next) next.disabled = !queue || queue.cursor >= queue.order.length - 1;
}

function renderQueuePlayer() {
  const bar = document.getElementById('queue-bar');
  if (!bar || !queue) return;

  bar.innerHTML = `
    <div class="queue-bar-inner">
      <span id="queue-label" class="queue-label">Loading…</span>
      <audio id="queue-audio" controls class="audio-player"></audio>
      <div class="queue-controls">
        <button class="queue-ctrl-btn" id="queue-prev" disabled>⏮</button>
        <button class="queue-ctrl-btn" id="queue-next">⏭</button>
        <button class="queue-ctrl-btn queue-stop-btn" id="queue-stop">■ Stop</button>
      </div>
    </div>`;

  document.getElementById('queue-prev').onclick = () => {
    if (queue && queue.cursor > 0) queueGoto(queue.cursor - 1);
  };
  document.getElementById('queue-next').onclick = () => {
    if (queue && queue.cursor < queue.order.length - 1) queueGoto(queue.cursor + 1);
  };
  document.getElementById('queue-stop').onclick = stopQueue;

  document.getElementById('queue-audio').addEventListener('ended', () => {
    if (queue && queue.cursor < queue.order.length - 1) queueGoto(queue.cursor + 1);
  });
}

async function queueGoto(cursor) {
  if (!queue) return;
  const prevUrl = queue.currentBlobUrl;
  queue.cursor = cursor;
  queue.currentBlobUrl = null;
  updateQueueNav();

  const track = queue.tracks[queue.order[cursor]];
  const labelEl = document.getElementById('queue-label');
  if (labelEl) labelEl.textContent = queueTrackLabel(track, cursor, queue.order.length);

  const audioEl = document.getElementById('queue-audio');
  if (audioEl) { audioEl.removeAttribute('src'); audioEl.load(); }

  try {
    const url = await makeBlobUrl(`files/${track.fileId}?alt=media`);

    if (!queue || queue.cursor !== cursor) { URL.revokeObjectURL(url); return; }

    if (prevUrl) {
      URL.revokeObjectURL(prevUrl);
      const idx = activeBlobUrls.indexOf(prevUrl);
      if (idx !== -1) activeBlobUrls.splice(idx, 1);
    }

    queue.currentBlobUrl = url;
    const audio = document.getElementById('queue-audio');
    if (audio) {
      audio.src = url;
      audio.load();
      audio.play().catch(() => {});
    }
  } catch (e) {
    if (queue) showError('Could not load track: ' + e.message);
  }
}

async function startQueue(songs, mode, isShuffled) {
  stopQueue();

  const bar = document.getElementById('queue-bar');
  if (bar) bar.innerHTML = `<div class="queue-bar-inner"><span class="queue-label">Building queue…</span></div>`;

  try {
    const folderContents = await Promise.all(songs.map(async s => {
      const q = encodeURIComponent(`'${s.id}' in parents and trashed=false`);
      const data = await apiJSON(`files?q=${q}&fields=files(id,name)`);
      return { song: s, files: data.files || [] };
    }));

    const tracks = [];
    for (const { song, files } of folderContents) {
      const find = pfx => files.find(f => f.name.toLowerCase().startsWith(pfx.toLowerCase()));
      if (mode === 'teacher' || mode === 'both') {
        const t = find('teacher-audio');
        if (t) tracks.push({ songName: song.name, fileId: t.id, type: 'teacher' });
      }
      if (mode === 'student' || mode === 'both') {
        const s = find('student-practice');
        if (s) tracks.push({ songName: song.name, fileId: s.id, type: 'student' });
      }
    }

    if (!tracks.length) {
      if (bar) bar.innerHTML = '';
      showError('No tracks found for this queue.');
      return;
    }

    const indices = tracks.map((_, i) => i);
    const order = isShuffled ? shuffleArray(indices) : indices;
    queue = { tracks, order, cursor: 0, currentBlobUrl: null, showType: mode === 'both' };
    renderQueuePlayer();
    await queueGoto(0);

  } catch (e) {
    if (bar) bar.innerHTML = '';
    showError(e.message);
  }
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
    const [songData, gods] = await Promise.all([
      apiJSON(`files?q=${q}&fields=files(id,name,properties)&orderBy=name`),
      fetchGodsData(),
    ]);
    const songs = (songData.files || []).filter(f => f.name !== '_Gods');

    if (!songs.length) {
      app().innerHTML = `
        ${userPillHtml()}
        ${godFilterRowHtml(gods)}
        <div class="empty-state">
          <p>No bhajans found.</p>
          <button class="btn-add-cta" id="cta-first">+ Add your first bhajan</button>
        </div>`;
      wireGodFilter([], gods);
      document.getElementById('cta-first').onclick = () => startWizard({ songs: [] });
      return;
    }

    app().innerHTML = `
      ${userPillHtml()}
      <div class="list-header">
        <h2 class="section-heading">🎵 Bhajans</h2>
        ${addContentBtnHtml()}
      </div>
      ${godFilterRowHtml(gods)}
      <div class="song-grid">
        ${songs.map(s => {
          const songGod = s.properties?.god || '';
          const godObj = gods.find(g => g.name === songGod);
          const badgeHtml = godObj ? `
            <div class="song-card-god-badge">
              ${godAvatarHtml(godObj, 'song-card-god-img')}
            </div>` : '';
          const hidden = activeGodFilter && songGod !== activeGodFilter ? ' style="display:none"' : '';
          return `
            <div class="song-card" data-id="${esc(s.id)}" data-name="${esc(s.name)}" data-god="${esc(songGod)}"${hidden}>
              ${badgeHtml}
              <div class="song-card-icon">🎶</div>
              <div class="song-card-name">${esc(s.name)}</div>
            </div>`;
        }).join('')}
      </div>
      <div class="queue-actions">
        <div class="queue-action-row">
          <button class="queue-play-btn" id="play-teacher">▶ Teacher clips</button>
          <button class="queue-shuffle-btn" id="shuf-teacher" aria-pressed="false" title="Shuffle">🔀</button>
        </div>
        <div class="queue-action-row">
          <button class="queue-play-btn" id="play-student">▶ Nyra's practice</button>
          <button class="queue-shuffle-btn" id="shuf-student" aria-pressed="false" title="Shuffle">🔀</button>
        </div>
        <div class="queue-action-row">
          <button class="queue-play-btn" id="play-all">▶ Everything</button>
          <button class="queue-shuffle-btn" id="shuf-all" aria-pressed="false" title="Shuffle">🔀</button>
        </div>
      </div>`;

    document.getElementById('add-content-btn').onclick = () => startWizard({ songs });
    wireGodFilter(songs, gods);

    app().querySelectorAll('.song-card').forEach(card =>
      card.addEventListener('click', () => showSong(card.dataset.id, card.dataset.name, songs))
    );

    [
      { mode: 'teacher', playId: 'play-teacher', shufId: 'shuf-teacher' },
      { mode: 'student', playId: 'play-student', shufId: 'shuf-student' },
      { mode: 'both',    playId: 'play-all',     shufId: 'shuf-all'     },
    ].forEach(({ mode, playId, shufId }) => {
      const shufBtn = document.getElementById(shufId);
      shufBtn.addEventListener('click', () => {
        const on = shufBtn.getAttribute('aria-pressed') === 'true';
        shufBtn.setAttribute('aria-pressed', String(!on));
      });
      document.getElementById(playId).addEventListener('click', () => {
        const isShuffled = shufBtn.getAttribute('aria-pressed') === 'true';
        startQueue(songs, mode, isShuffled);
      });
    });

  } catch (e) {
    showError(e.message);
  }
}

async function showSong(folderId, songName, cachedSongs = null) {
  stopQueue();
  revokeBlobs();
  const fromSong = { id: folderId, name: songName };

  app().innerHTML = `
    <div class="song-view-header">
      <button class="back-btn" id="back-btn">← Bhajans</button>
      ${addContentBtnHtml()}
    </div>
    <h2 class="song-title">${esc(songName)}</h2>
    <div id="god-tag-row"></div>
    <div id="teacher-section" class="song-section">
      <h3 class="section-title">🎵 Teacher Reference</h3>
      <span id="teacher-status" class="loading-inline">Loading…</span>
    </div>
    <div id="student-section" class="song-section">
      <h3 class="section-title">🎤 Nyra's Practice</h3>
      <span id="student-status" class="loading-inline">Loading…</span>
    </div>`;

  document.getElementById('back-btn').addEventListener('click', () => showSongList());
  document.getElementById('add-content-btn').onclick = () =>
    startWizard({ fromSong, songs: cachedSongs, presetSong: fromSong });

  try {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    const [data, folderMeta] = await Promise.all([
      apiJSON(`files?q=${q}&fields=files(id,name)`),
      apiJSON(`files/${folderId}?fields=properties`),
    ]);
    const files = data.files || [];
    const godTag = folderMeta.properties?.god || null;
    renderGodTagSection(folderId, songName, godTag, cachedSongs);

    const find = prefix => files.find(f => f.name.toLowerCase().startsWith(prefix.toLowerCase()));

    const teacherAudio = find('teacher-audio');
    const teacherNotes = find('teacher-notes');
    const studentFile  = find('student-practice');

    // Teacher section
    const teacherEl = document.getElementById('teacher-section');
    if (!teacherAudio && !teacherNotes) {
      document.getElementById('teacher-status').outerHTML = `
        <p class="hint">No teacher files in this folder yet.</p>
        <button class="btn-add-cta" id="cta-teacher">+ Add teacher content</button>`;
      document.getElementById('cta-teacher').onclick = () =>
        startWizard({ fromSong, songs: cachedSongs, presetSong: fromSong });
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
      document.getElementById('student-status').outerHTML = `
        <p class="hint">No practice take yet.</p>
        <button class="btn-add-cta" id="cta-practice">+ Add a practice take</button>`;
      document.getElementById('cta-practice').onclick = () =>
        startWizard({ fromSong, songs: cachedSongs, presetType: 'student-practice', presetSong: fromSong });
      return;
    }

    const [latestUrl, revData] = await Promise.all([
      makeBlobUrl(`files/${studentFile.id}?alt=media`),
      apiJSON(`files/${studentFile.id}/revisions?fields=revisions(id,modifiedTime,keepForever)`),
    ]);

    const revisions = (revData.revisions || []).reverse();
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

// --- God tag section (in song detail) ---

function renderGodTagSection(folderId, songName, godTag, cachedSongs) {
  const container = document.getElementById('god-tag-row');
  if (!container) return;
  const gods = cachedGods || [];
  const godObj = godTag ? gods.find(g => g.name === godTag) : null;
  const noPhoto = godObj && !godObj.blobUrl;

  container.innerHTML = `
    <div class="god-tag-section">
      ${godObj ? `
        <div class="god-tag-display">
          <div class="god-tag-avatar" id="god-tag-avatar-el">
            ${godAvatarHtml(godObj)}
          </div>
          <span class="god-tag-name">${esc(godObj.name)}</span>
          ${noPhoto ? `<button class="god-emoji-edit-btn" id="god-emoji-edit-btn" title="Choose emoji">🖌️</button>` : ''}
          <button class="god-tag-btn" id="god-tag-change">Change</button>
        </div>` : `
        <button class="god-tag-btn god-tag-btn-add" id="god-tag-add">🙏 Tag with god</button>`}
    </div>`;

  if (noPhoto) {
    const editBtn = document.getElementById('god-emoji-edit-btn');
    if (editBtn) editBtn.onclick = () => {
      const avatarEl = document.getElementById('god-tag-avatar-el');
      if (avatarEl) showEmojiInputInline(godObj, avatarEl, () =>
        renderGodTagSection(folderId, songName, godTag, cachedSongs)
      );
    };
  }

  const trigger = document.getElementById('god-tag-change') || document.getElementById('god-tag-add');
  if (trigger) trigger.onclick = () => showInlineGodPicker(folderId, songName, container, gods, cachedSongs);
}

function showInlineGodPicker(folderId, songName, container, gods, cachedSongs) {
  const godOptions = gods.map(g => `
    <button class="god-picker-option" data-god="${esc(g.name)}">
      <div class="god-chip-circle">
        ${godAvatarHtml(g)}
      </div>
      <span>${esc(g.name)}</span>
    </button>`).join('');

  container.innerHTML = `
    <div class="god-tag-section">
      <div class="god-picker">
        <span class="god-picker-label">Tag with god:</span>
        <div class="god-picker-options">
          <button class="god-picker-option god-picker-none" data-god="">
            <div class="god-chip-circle god-chip-all-circle">✕</div>
            <span>None</span>
          </button>
          ${godOptions}
          <button class="god-picker-option god-picker-add" id="picker-add-god">
            <div class="god-chip-circle god-chip-add-circle">+</div>
            <span>Add god</span>
          </button>
        </div>
      </div>
    </div>`;

  container.querySelectorAll('.god-picker-option[data-god]').forEach(btn => {
    btn.onclick = async () => {
      const newGod = btn.dataset.god || null;
      container.innerHTML = `<div class="god-tag-section"><span class="loading-inline">Saving…</span></div>`;
      try {
        await driveUpdateProperties(folderId, { god: newGod || null });
        renderGodTagSection(folderId, songName, newGod, cachedSongs);
      } catch (e) {
        showError(e.message);
        renderGodTagSection(folderId, songName, null, cachedSongs);
      }
    };
  });

  const pickerAddBtn = document.getElementById('picker-add-god');
  if (pickerAddBtn) pickerAddBtn.onclick = () =>
    showAddGodForm({ id: folderId, name: songName }, cachedSongs);
}

async function showAddGodForm(fromSong, cachedSongs) {
  let addGodBlob = null, addGodMime = null, addGodExt = null, addGodPreviewUrl = null;
  let addGodEmoji = '';

  const render = () => {
    if (addGodPreviewUrl) {
      const idx = activeBlobUrls.indexOf(addGodPreviewUrl);
      if (idx !== -1) activeBlobUrls.splice(idx, 1);
      URL.revokeObjectURL(addGodPreviewUrl);
      addGodPreviewUrl = null;
    }
    if (addGodBlob) {
      addGodPreviewUrl = URL.createObjectURL(addGodBlob);
      activeBlobUrls.push(addGodPreviewUrl);
    }

    app().innerHTML = wizardShell(`
      <h3 class="wizard-title">Add a god</h3>
      <div class="add-god-form">
        <label class="add-god-label">Name</label>
        <input type="text" id="god-name-input" class="new-song-input" placeholder="e.g. Ganesha" maxlength="60">
        <label class="add-god-label" style="margin-top:12px">Photo</label>
        <div class="capture-options">
          <label class="capture-btn" for="god-img-file">📷 Choose photo</label>
          <input type="file" id="god-img-file" accept="image/*" style="display:none">
        </div>
        ${addGodPreviewUrl ? `<div class="god-preview"><img src="${esc(addGodPreviewUrl)}" class="god-preview-img" alt="Preview"></div>` : ''}
        <label class="add-god-label" style="margin-top:12px">Emoji</label>
        <input type="text" id="god-emoji-field" class="god-emoji-field" placeholder="🕉️" maxlength="8" value="${esc(addGodEmoji)}">
        <p class="add-god-hint">Optional — used if no photo is added</p>
        <button class="btn-primary" id="god-save-btn" style="margin-top:16px">Save god</button>
      </div>`);

    document.getElementById('wizard-cancel').onclick = () => {
      if (fromSong) showSong(fromSong.id, fromSong.name, cachedSongs);
      else showSongList();
    };

    document.getElementById('god-img-file').onchange = e => {
      const file = e.target.files[0];
      if (!file) return;
      addGodBlob = file;
      addGodMime = file.type || 'image/jpeg';
      addGodExt = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : 'jpg';
      render();
    };

    document.getElementById('god-emoji-field').addEventListener('input', e => {
      const capped = Array.from(e.target.value).slice(0, 1).join('');
      e.target.value = capped;
      addGodEmoji = capped;
    });

    document.getElementById('god-save-btn').onclick = async () => {
      const name = document.getElementById('god-name-input')?.value.trim();
      if (!name) return;
      const btn = document.getElementById('god-save-btn');
      btn.disabled = true; btn.textContent = 'Saving…';
      try {
        const folderId = await ensureGodsFolderId();
        const emojiProp = addGodEmoji ? { properties: { emoji: addGodEmoji } } : {};
        let file;
        if (addGodBlob) {
          file = await driveUpload(
            { name: `${name}.${addGodExt}`, mimeType: addGodMime, parents: [folderId], ...emojiProp },
            addGodBlob
          );
        } else {
          file = await apiPost('files', { name: `${name}.txt`, mimeType: 'text/plain', parents: [folderId], ...emojiProp });
        }
        let blobUrl = null;
        if (addGodBlob) {
          try { blobUrl = await makeGodBlobUrl(`files/${file.id}?alt=media`); } catch (_) {}
        }
        if (!cachedGods) cachedGods = [];
        cachedGods.push({ name, fileId: file.id, blobUrl, properties: addGodEmoji ? { emoji: addGodEmoji } : {} });
        cachedGods.sort((a, b) => a.name.localeCompare(b.name));
        if (fromSong) {
          await driveUpdateProperties(fromSong.id, { god: name });
          showSong(fromSong.id, fromSong.name, cachedSongs);
        } else {
          showSongList();
        }
      } catch (e) {
        showError(e.message);
        btn.disabled = false; btn.textContent = 'Save god';
      }
    };
  };

  render();
}

async function showEmojiInputInline(god, targetEl, onDone) {
  let saved = false;
  const prevHtml = targetEl.innerHTML;

  targetEl.innerHTML = `<input type="text" class="god-emoji-input" placeholder="😊" maxlength="8" value="${esc(god.properties?.emoji || '')}">`;
  const input = targetEl.querySelector('.god-emoji-input');
  input.focus();
  input.select();

  async function save() {
    if (saved) return;
    const graphemes = Array.from(input.value.trim());
    if (graphemes.length === 0) { saved = true; targetEl.innerHTML = prevHtml; onDone(); return; }
    if (graphemes.length !== 1) {
      input.style.outline = '2px solid #E53935';
      setTimeout(() => { if (input.isConnected) input.style.outline = ''; }, 900);
      return;
    }
    saved = true;
    const emoji = graphemes[0];
    try {
      await driveUpdateProperties(god.fileId, { emoji });
      const entry = (cachedGods || []).find(g => g.name === god.name);
      if (entry) { if (!entry.properties) entry.properties = {}; entry.properties.emoji = emoji; }
    } catch (e) { showError(e.message); }
    onDone();
  }

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); save(); }
    if (e.key === 'Escape') { saved = true; targetEl.innerHTML = prevHtml; }
  });
  input.addEventListener('blur', save);
}

// --- Wizard ---

// opts: { fromSong, songs, presetType, presetSong }
function startWizard(opts = {}) {
  stopActiveRecording();
  stopQueue();
  wizard = {
    fromSong: opts.fromSong || null,
    songs: opts.songs || null,
    contentType: opts.presetType || null,
    song: opts.presetSong || null,
    blob: null,
    mimeType: null,
    extension: null,
  };

  if (wizard.contentType && wizard.song) {
    showWizardCapture();
  } else if (wizard.contentType) {
    showWizardSong();
  } else {
    showWizardType();
  }
}

function wizardShell(content) {
  return `
    <div class="wizard-container">
      <div class="wizard-header">
        <button class="back-btn" id="wizard-cancel">✕ Cancel</button>
      </div>
      <div class="wizard-body">${content}</div>
    </div>`;
}

function showWizardType() {
  app().innerHTML = wizardShell(`
    <h3 class="wizard-title">What are you adding?</h3>
    <div class="type-options">
      <button class="type-btn" data-type="teacher-audio">
        <span class="type-icon">🎵</span>
        <span class="type-label">Teacher's audio clip</span>
      </button>
      <button class="type-btn" data-type="teacher-notes">
        <span class="type-icon">📝</span>
        <span class="type-label">Teacher's notes (photo)</span>
      </button>
      <button class="type-btn" data-type="student-practice">
        <span class="type-icon">🎤</span>
        <span class="type-label">Nyra's practice take</span>
      </button>
    </div>`);

  document.getElementById('wizard-cancel').onclick = cancelWizard;
  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.onclick = () => {
      wizard.contentType = btn.dataset.type;
      wizard.song ? showWizardCapture() : showWizardSong();
    };
  });
}

async function showWizardSong() {
  app().innerHTML = wizardShell(`<div class="loading">Loading songs…</div>`);
  document.getElementById('wizard-cancel').onclick = cancelWizard;

  if (!wizard.songs) {
    try {
      const q = encodeURIComponent(
        `'${CONFIG.BHAJANS_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
      );
      const data = await apiJSON(`files?q=${q}&fields=files(id,name)&orderBy=name`);
      wizard.songs = (data.files || []).filter(f => f.name !== '_Gods');
    } catch (e) {
      showError(e.message);
      cancelWizard();
      return;
    }
  }

  renderWizardSong();
}

function renderWizardSong() {
  app().innerHTML = wizardShell(`
    <h3 class="wizard-title">Which song?</h3>
    <div class="song-options">
      <div class="new-song-row">
        <button class="song-option-btn new-song-btn" id="new-song-toggle">+ New song</button>
        <div class="new-song-form" id="new-song-form" style="display:none">
          <input type="text" id="new-song-input" class="new-song-input" placeholder="Song name…" maxlength="100">
          <button class="btn-primary" id="new-song-create">Create</button>
        </div>
      </div>
      ${(wizard.songs || []).map(s => `
        <button class="song-option-btn" data-id="${esc(s.id)}" data-name="${esc(s.name)}">
          🎶 ${esc(s.name)}
        </button>`).join('')}
    </div>`);

  document.getElementById('wizard-cancel').onclick = cancelWizard;

  document.querySelectorAll('.song-option-btn:not(.new-song-btn)').forEach(btn => {
    btn.onclick = () => {
      wizard.song = { id: btn.dataset.id, name: btn.dataset.name };
      showWizardCapture();
    };
  });

  document.getElementById('new-song-toggle').onclick = () => {
    document.getElementById('new-song-toggle').style.display = 'none';
    document.getElementById('new-song-form').style.display = 'flex';
    document.getElementById('new-song-input').focus();
  };

  document.getElementById('new-song-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('new-song-create').click();
  });

  document.getElementById('new-song-create').onclick = async () => {
    const name = document.getElementById('new-song-input').value.trim();
    if (!name) return;
    const btn = document.getElementById('new-song-create');
    btn.disabled = true; btn.textContent = 'Creating…';
    try {
      const folder = await apiPost('files', {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [CONFIG.BHAJANS_FOLDER_ID],
      });
      wizard.song = { id: folder.id, name: folder.name };
      wizard.songs = [...(wizard.songs || []), wizard.song].sort((a, b) => a.name.localeCompare(b.name));
      showWizardCapture();
    } catch (e) {
      btn.disabled = false; btn.textContent = 'Create';
      showError(e.message);
    }
  };
}

function showWizardCapture() {
  const isAudio = wizard.contentType !== 'teacher-notes';
  const isImage = wizard.contentType === 'teacher-notes';

  app().innerHTML = wizardShell(`
    <h3 class="wizard-title">Capture content</h3>
    <p class="wizard-subtitle">
      ${typeLabel(wizard.contentType)} for <strong>${esc(wizard.song.name)}</strong>
    </p>
    ${isAudio ? `
      <div class="capture-options" id="capture-options">
        <button class="capture-btn" id="btn-record">🎙️ Record live</button>
        <button class="capture-btn" id="btn-upload-audio">📁 Upload a file</button>
        <input type="file" id="file-audio" accept="audio/*" style="display:none">
      </div>` : ''}
    ${isImage ? `
      <div class="capture-options">
        <label class="capture-btn" for="file-image">📷 Choose / take photo</label>
        <input type="file" id="file-image" accept="image/*" style="display:none">
      </div>` : ''}
    <div class="recording-panel" id="recording-panel" style="display:none">
      <div class="recording-indicator">
        <span class="rec-dot"></span>
        <span id="rec-timer">0:00</span>
      </div>
      <button class="btn-primary" id="btn-stop-record">Stop</button>
    </div>`);

  document.getElementById('wizard-cancel').onclick = cancelWizard;

  if (isAudio) {
    document.getElementById('btn-record').onclick = startRecording;
    document.getElementById('btn-upload-audio').onclick = () => document.getElementById('file-audio').click();
    document.getElementById('file-audio').onchange = e => {
      const file = e.target.files[0];
      if (!file) return;
      const ext = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : 'audio';
      showWizardConfirm(file, file.type || 'audio/webm', ext);
    };
  }

  if (isImage) {
    document.getElementById('file-image').onchange = e => {
      const file = e.target.files[0];
      if (!file) return;
      const ext = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : 'jpg';
      showWizardConfirm(file, file.type || 'image/jpeg', ext);
    };
  }
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    _recordingStream = stream;
    _recordingChunks = [];
    _recorder = new MediaRecorder(stream);
    _recorder.ondataavailable = e => { if (e.data.size > 0) _recordingChunks.push(e.data); };
    _recorder.start();

    const captureOptions = document.getElementById('capture-options');
    if (captureOptions) captureOptions.style.display = 'none';
    document.getElementById('recording-panel').style.display = 'block';

    let secs = 0;
    _recordingTimer = setInterval(() => {
      secs++;
      const m = Math.floor(secs / 60), s = secs % 60;
      const el = document.getElementById('rec-timer');
      if (el) el.textContent = `${m}:${s.toString().padStart(2, '0')}`;
    }, 1000);

    document.getElementById('btn-stop-record').onclick = () => {
      clearInterval(_recordingTimer); _recordingTimer = null;
      _recorder.onstop = () => {
        const mimeType = _recorder.mimeType || 'audio/webm';
        const blob = new Blob(_recordingChunks, { type: mimeType });
        _recordingStream.getTracks().forEach(t => t.stop()); _recordingStream = null;
        _recorder = null;
        const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'mp4' : 'webm';
        showWizardConfirm(blob, mimeType, ext);
      };
      if (_recorder.state !== 'inactive') _recorder.stop();
    };
  } catch (e) {
    showError('Microphone access denied: ' + e.message);
  }
}

function showWizardConfirm(blob, mimeType, ext) {
  wizard.blob = blob;
  wizard.mimeType = mimeType;
  wizard.extension = ext;

  const previewUrl = trackBlob(URL.createObjectURL(blob));
  const isAudio = mimeType.startsWith('audio');
  const previewHtml = isAudio
    ? `<audio controls src="${previewUrl}" class="audio-player"></audio>`
    : `<img src="${previewUrl}" class="notes-img" alt="Preview">`;

  app().innerHTML = wizardShell(`
    <h3 class="wizard-title">Does this look right?</h3>
    <p class="wizard-subtitle">
      ${typeLabel(wizard.contentType)} for <strong>${esc(wizard.song.name)}</strong>
    </p>
    <div class="preview-box">${previewHtml}</div>
    <div class="confirm-btns">
      <button class="btn-primary" id="btn-save">Save</button>
      <button class="back-btn" id="btn-redo">Discard &amp; redo</button>
    </div>`);

  document.getElementById('wizard-cancel').onclick = cancelWizard;

  document.getElementById('btn-save').onclick = async () => {
    const btn = document.getElementById('btn-save');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      await saveContent();
      const song = wizard.song;
      const songs = wizard.songs;
      wizard = null;
      await showSong(song.id, song.name, songs);
    } catch (e) {
      btn.disabled = false; btn.textContent = 'Save';
      showError(e.message);
    }
  };

  document.getElementById('btn-redo').onclick = () => {
    URL.revokeObjectURL(previewUrl);
    const idx = activeBlobUrls.indexOf(previewUrl);
    if (idx !== -1) activeBlobUrls.splice(idx, 1);
    wizard.blob = null; wizard.mimeType = null; wizard.extension = null;
    showWizardCapture();
  };
}

async function saveContent() {
  const { contentType, song, blob, mimeType, extension } = wizard;

  const q = encodeURIComponent(`'${song.id}' in parents and trashed=false`);
  const data = await apiJSON(`files?q=${q}&fields=files(id,name,mimeType)`);
  const files = data.files || [];
  const existing = files.find(f => f.name.toLowerCase().startsWith(contentType.toLowerCase()));

  if (existing) {
    await driveUpload({ mimeType }, blob, existing.id);
  } else {
    await driveUpload({ name: `${contentType}.${extension}`, mimeType, parents: [song.id] }, blob);
  }
}

function cancelWizard() {
  stopActiveRecording();
  const fromSong = wizard?.fromSong;
  wizard = null;
  if (fromSong) {
    showSong(fromSong.id, fromSong.name);
  } else {
    showSongList();
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

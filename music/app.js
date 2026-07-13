import { CONFIG } from './config.js';

const CONFIGURED = !CONFIG.CLIENT_ID.startsWith('PASTE') && !CONFIG.BHAJANS_FOLDER_ID.startsWith('PASTE') && !!CONFIG.DRIVE_READ_API_KEY;
const ACTIVE_FOLDER_ID = new URLSearchParams(window.location.search).get('folderId') || CONFIG.BHAJANS_FOLDER_ID;
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

// Songs cached by showSongList for header play buttons
let cachedSongsList = null;

// Students — folder property `students` (JSON string of [{name, gender, age}])
let cachedStudents = [];

const GENDER_ICON = { girl: '👧', boy: '👦', other: '🧒' };
function genderIcon(gender) { return GENDER_ICON[gender] || '🧒'; }

function isVideoMime(mimeType) { return !!mimeType && mimeType.startsWith('video/'); }

// Fixed pool, single constant so it's easy to adjust later — see "Practice recording tags" below.
const EMOTION_POOL = [
  { id: 'happy',      label: 'Happy',      emoji: '😄' },
  { id: 'silly',      label: 'Silly',      emoji: '🤪' },
  { id: 'focused',    label: 'Focused',    emoji: '🎯' },
  { id: 'frustrated', label: 'Frustrated', emoji: '😤' },
  { id: 'proud',      label: 'Proud',      emoji: '🌟' },
];

// God filter state — persists for the session (survive revokeBlobs)
let godsFolderId = null;
let cachedGods = null;       // null=not fetched; array of { name, fileId, blobUrl }
let activeGodFilter = null;  // null=show all; string=god name to filter by
const godBlobUrls = [];      // separate from activeBlobUrls so they survive revokeBlobs()

const GOD_COLORS = {
  Ganesha:  '#E07B39',
  Guru:     '#5B8ECC',
  Hanuman:  '#E8A020',
  Krishna:  '#6A5ACD',
  Ram:      '#2E8B57',
  Shiva:    '#7B68EE',
  _default: '#AAAAAA',
};

function trackBlob(url) { activeBlobUrls.push(url); return url; }

function revokeBlobs() {
  activeBlobUrls.forEach(u => URL.revokeObjectURL(u));
  activeBlobUrls.length = 0;
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

async function ensureAuth() {
  if (accessToken) return;
  await requestToken();
  try {
    const info = await (await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })).json();
    currentUser = info;
  } catch (_) {}
  onSignIn();
}

function onSignIn() {
  document.body.classList.remove('anon');
  const userEl = document.getElementById('hdr-user');
  if (userEl && currentUser) {
    const avatar = currentUser.picture ? `<img src="${esc(currentUser.picture)}" class="user-avatar" alt="">` : '';
    userEl.innerHTML = `<div class="user-pill">${avatar}<span>${esc(currentUser.name)}</span></div>`;
  }
}

// --- Students (folder property: students, JSON array of {name, gender, age}) ---

async function fetchFolderProfile() {
  try {
    const data = await readJSON(`files/${ACTIVE_FOLDER_ID}?fields=properties`);
    const props = data.properties || {};
    if (props.students) {
      try { cachedStudents = JSON.parse(props.students) || []; } catch (_) { cachedStudents = []; }
    } else if (props.childName) {
      // Migration from the single-child schema (properties.childName/gender/age)
      cachedStudents = [{ name: props.childName, gender: props.gender || '', age: props.age || '' }];
    } else {
      cachedStudents = [];
    }
  } catch (_) {
    cachedStudents = [];
  }
  applyHeaderUI();
}

// Matches a student's practice file by the new `student-{name}-practice.*` prefix. Falls back to
// the pre-multi-student `student-practice.*` prefix when there's exactly one student, so existing
// recordings saved before this feature keep showing up (see driveUpload's rename-preserving policy).
function matchStudentFile(files, studentName) {
  const specific = files.find(f => f.name.toLowerCase().startsWith(`student-${studentName}-practice`.toLowerCase()));
  if (specific) return specific;
  if (cachedStudents.length === 1) {
    return files.find(f => f.name.toLowerCase().startsWith('student-practice'));
  }
  return null;
}

function applyHeaderUI() {
  const single = cachedStudents.length === 1 ? cachedStudents[0].name : null;
  document.title = single ? `${single}'s Bhajan Practice` : 'Bhajan Practice';
  const titleEl = document.getElementById('header-title');
  if (titleEl) titleEl.textContent = single ? `${single}'s Bhajans` : 'Bhajans';
  renderHeaderPlayPills();
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

// Read-only helpers — use API key, no OAuth required
const readUrl = path => `${BASE}/${path}${path.includes('?') ? '&' : '?'}key=${CONFIG.DRIVE_READ_API_KEY}`;
const readJSON = async path => {
  const r = await fetch(readUrl(path));
  if (!r.ok) throw new Error(`Drive API error ${r.status}`);
  return r.json();
};
const readText = async path => {
  const r = await fetch(readUrl(path));
  if (!r.ok) throw new Error(`Drive API error ${r.status}`);
  return r.text();
};
const driveMediaUrl = path => readUrl(path);

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

async function renameFile(fileId, name) {
  const doFetch = () => fetch(`${BASE}/files/${fileId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  let resp = await doFetch();
  if (resp.status === 401) { await requestToken({ prompt: '' }); resp = await doFetch(); }
  if (!resp.ok) throw new Error(`Drive API error ${resp.status}`);
  return resp.json();
}

async function apiDelete(path) {
  const doFetch = () => fetch(`${BASE}/${path}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  let resp = await doFetch();
  if (resp.status === 401) { await requestToken({ prompt: '' }); resp = await doFetch(); }
  if (!resp.ok && resp.status !== 204) throw new Error(`Drive API error ${resp.status}`);
}

// Moves a whole file to Drive's trash (recoverable there) — not a permanent delete.
async function driveTrashFile(fileId) {
  const doFetch = () => fetch(`${BASE}/files/${fileId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: true }),
  });
  let resp = await doFetch();
  if (resp.status === 401) { await requestToken({ prompt: '' }); resp = await doFetch(); }
  if (!resp.ok) throw new Error(`Drive API error ${resp.status}`);
  return resp.json();
}

async function findGodsFolderId() {
  if (godsFolderId) return godsFolderId;
  const q = encodeURIComponent(
    `'${ACTIVE_FOLDER_ID}' in parents and name='_Gods' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const data = await readJSON(`files?q=${q}&fields=files(id)`);
  if (data.files?.length) godsFolderId = data.files[0].id;
  return godsFolderId; // null if not yet created
}

async function ensureGodsFolderId() {
  const found = await findGodsFolderId();
  if (found) return found;
  const folder = await apiPost('files', {
    name: '_Gods',
    mimeType: 'application/vnd.google-apps.folder',
    parents: [ACTIVE_FOLDER_ID],
  });
  godsFolderId = folder.id;
  return godsFolderId;
}

async function fetchGodsData() {
  if (cachedGods !== null) return cachedGods;
  try {
    const folderId = await findGodsFolderId();
    if (!folderId) { cachedGods = []; return []; }
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    const data = await readJSON(`files?q=${q}&fields=files(id,name,mimeType,properties)&orderBy=name`);
    const files = data.files || [];
    cachedGods = files.map(f => {
      const name = f.name.includes('.') ? f.name.substring(0, f.name.lastIndexOf('.')) : f.name;
      const blobUrl = f.mimeType?.startsWith('image/') ? driveMediaUrl(`files/${f.id}?alt=media`) : null;
      return { name, fileId: f.id, blobUrl, properties: f.properties || {} };
    });
    return cachedGods;
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
  return `<button class="add-content-btn write-only" id="add-content-btn">+ Add content</button>`;
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
      ${noPhoto ? `<button class="god-emoji-mini-btn write-only" data-god-name="${esc(g.name)}" title="Set emoji">🖌️</button>` : ''}
    </div>`;
  }).join('');
  return `
    <div class="god-filter-wrap">
      <div class="god-filter-row">
        <button class="god-chip god-chip-all${allActive ? ' active' : ''}" data-god="">
          <div class="god-chip-circle god-chip-all-circle">All</div>
          <span class="god-chip-label">All</span>
        </button>
        ${godChips}
        <button class="god-chip god-chip-add write-only" id="god-add-btn">
          <div class="god-chip-circle god-chip-add-circle">+</div>
          <span class="god-chip-label">Add</span>
        </button>
      </div>
    </div>`;
}

function wireGodFilter(songs, gods) {
  const filterRow = document.querySelector('.god-filter-row');
  const filterWrap = document.querySelector('.god-filter-wrap');
  if (filterRow && filterWrap) {
    const updateFade = () => {
      const atEnd = filterRow.scrollLeft + filterRow.clientWidth >= filterRow.scrollWidth - 4;
      filterWrap.classList.toggle('at-end', atEnd);
    };
    filterRow.addEventListener('scroll', updateFade, { passive: true });
    updateFade();
  }

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
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      try { await ensureAuth(); } catch (e) { showError(e.message); return; }
      const godName = btn.dataset.godName;
      const god = (cachedGods || []).find(g => g.name === godName);
      if (!god) return;
      const circle = btn.closest('.god-chip-wrap')?.querySelector('.god-chip-circle');
      if (circle) showEmojiInputInline(god, circle, () => { circle.innerHTML = godAvatarHtml(god); });
    });
  });
  const addBtn = document.getElementById('god-add-btn');
  if (addBtn) addBtn.onclick = async () => {
    try { await ensureAuth(); } catch (e) { showError(e.message); return; }
    showAddGodForm(null, songs, gods);
  };
}

function typeLabel(type, studentName) {
  return type === 'teacher-audio' ? "Teacher's audio clip"
       : type === 'teacher-notes' ? "Teacher's notes (photo)"
       : `${studentName}'s practice take`;
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
  queue = null;
  const bar = document.getElementById('queue-bar');
  if (bar) bar.innerHTML = '';
}

function queueTrackLabel(track, cursor, total) {
  const pos = `${cursor + 1} of ${total}`;
  const name = queue?.showType
    ? `${esc(track.songName)} (${track.type === 'teacher' ? 'teacher' : esc(track.studentName || '')})`
    : esc(track.songName);
  return `${name} — ${pos}`;
}

function updateQueueNav() {
  const prev = document.getElementById('queue-prev');
  const next = document.getElementById('queue-next');
  if (prev) prev.disabled = !queue || queue.cursor <= 0;
  if (next) next.disabled = !queue || queue.cursor >= queue.order.length - 1;
}

// Toggles shuffle on the active queue only. History (everything up to and including the current
// track) is left untouched — that's what makes ⏮ Prev walk back through actual play order. Only
// the not-yet-played remainder is reordered: Fisher-Yates when turning on, back to original
// sequential (track-build) order when turning off. Never touches cursor, so playback isn't
// interrupted either way.
function toggleQueueShuffle() {
  if (!queue) return;
  queue.shuffled = !queue.shuffled;

  const history = queue.order.slice(0, queue.cursor + 1);
  const remainder = queue.shuffled
    ? shuffleArray(queue.order.slice(queue.cursor + 1))
    : queue.tracks.map((_, i) => i).filter(i => !history.includes(i));
  queue.order = [...history, ...remainder];

  updateQueueNav();
  const btn = document.getElementById('queue-shuffle');
  if (btn) btn.setAttribute('aria-pressed', String(queue.shuffled));
}

function renderQueuePlayer() {
  const bar = document.getElementById('queue-bar');
  if (!bar || !queue) return;

  bar.innerHTML = `
    <div class="queue-bar-inner">
      <span id="queue-label" class="queue-label">Loading…</span>
      <audio id="queue-audio" controls class="audio-player"></audio>
      <video id="queue-video" controls playsinline class="video-player" style="display:none"></video>
      <div class="queue-controls">
        ${queue.tracks.length > 1 ? `<button class="queue-ctrl-btn" id="queue-shuffle" aria-pressed="${queue.shuffled}" title="Shuffle">🔀</button>` : ''}
        <button class="queue-ctrl-btn" id="queue-prev" disabled>⏮</button>
        <button class="queue-ctrl-btn" id="queue-next">⏭</button>
        <button class="queue-ctrl-btn queue-stop-btn" id="queue-stop">■ Stop</button>
      </div>
    </div>`;

  const shuffleBtn = document.getElementById('queue-shuffle');
  if (shuffleBtn) shuffleBtn.onclick = toggleQueueShuffle;

  document.getElementById('queue-prev').onclick = () => {
    if (queue && queue.cursor > 0) queueGoto(queue.cursor - 1);
  };
  document.getElementById('queue-next').onclick = () => {
    if (queue && queue.cursor < queue.order.length - 1) queueGoto(queue.cursor + 1);
  };
  document.getElementById('queue-stop').onclick = stopQueue;

  const onEnded = () => {
    if (queue && queue.cursor < queue.order.length - 1) queueGoto(queue.cursor + 1);
  };
  document.getElementById('queue-audio').addEventListener('ended', onEnded);
  document.getElementById('queue-video').addEventListener('ended', onEnded);
}

function queueGoto(cursor) {
  if (!queue) return;
  queue.cursor = cursor;
  updateQueueNav();
  const track = queue.tracks[queue.order[cursor]];
  const labelEl = document.getElementById('queue-label');
  if (labelEl) labelEl.textContent = queueTrackLabel(track, cursor, queue.order.length);

  const audio = document.getElementById('queue-audio');
  const video = document.getElementById('queue-video');
  const [active, inactive] = isVideoMime(track.mimeType) ? [video, audio] : [audio, video];

  if (inactive) {
    inactive.pause();
    inactive.removeAttribute('src');
    inactive.style.display = 'none';
  }
  if (active) {
    active.style.display = 'block';
    active.src = driveMediaUrl(`files/${track.fileId}?alt=media`);
    active.load();
    active.play().catch(() => {});
  }
}

async function startQueue(songs, mode, studentName = null) {
  stopQueue();
  stopCardVideo();

  const bar = document.getElementById('queue-bar');
  if (bar) bar.innerHTML = `<div class="queue-bar-inner"><span class="queue-label">Building queue…</span></div>`;

  try {
    const folderContents = await Promise.all(songs.map(async s => {
      const q = encodeURIComponent(`'${s.id}' in parents and trashed=false`);
      const data = await readJSON(`files?q=${q}&fields=files(id,name,mimeType)`);
      return { song: s, files: data.files || [] };
    }));

    const tracks = [];
    for (const { song, files } of folderContents) {
      if (mode === 'teacher' || mode === 'both') {
        const t = files.find(f => f.name.toLowerCase().startsWith('teacher-audio'));
        if (t) tracks.push({ songName: song.name, fileId: t.id, mimeType: t.mimeType, type: 'teacher' });
      }
      if (mode === 'student') {
        const s = matchStudentFile(files, studentName);
        if (s) tracks.push({ songName: song.name, fileId: s.id, mimeType: s.mimeType, type: 'student', studentName });
      }
      if (mode === 'both') {
        for (const student of cachedStudents) {
          const s = matchStudentFile(files, student.name);
          if (s) tracks.push({ songName: song.name, fileId: s.id, mimeType: s.mimeType, type: 'student', studentName: student.name });
        }
      }
    }

    if (!tracks.length) {
      if (bar) bar.innerHTML = '';
      showError('No tracks found for this queue.');
      return;
    }

    const indices = tracks.map((_, i) => i);
    queue = { tracks, order: shuffleArray(indices), cursor: 0, showType: mode === 'both', shuffled: true };
    renderQueuePlayer();
    await queueGoto(0);

  } catch (e) {
    if (bar) bar.innerHTML = '';
    showError(e.message);
  }
}

// Single-track playback for song-card row taps — reuses the queue bar with a one-track queue.
async function playSingleTrack(songName, roleLabel, fileId) {
  stopQueue();
  stopCardVideo();
  queue = { tracks: [{ songName: `${songName} (${roleLabel})`, fileId, type: 'single' }], order: [0], cursor: 0, showType: false, shuffled: false };
  renderQueuePlayer();
  await queueGoto(0);
}

// Inline video playback for a filled song-card row — plays right in the card, not the queue bar.
let activeCardVideoEl = null;

function stopCardVideo() {
  if (activeCardVideoEl) {
    activeCardVideoEl.remove();
    activeCardVideoEl = null;
  }
}

function playInlineCardVideo(row, fileId) {
  stopQueue();
  stopCardVideo();
  const video = document.createElement('video');
  video.controls = true;
  video.autoplay = true;
  video.playsInline = true;
  video.className = 'card-video-player';
  video.src = driveMediaUrl(`files/${fileId}?alt=media`);
  row.insertAdjacentElement('afterend', video);
  activeCardVideoEl = video;
}

// --- Song card rows (Teacher + one per student) ---

function songCardRowHtml(kind, icon, label, file, song, studentName = '') {
  const filled = !!file;
  return `
    <div class="song-card-row${filled ? '' : ' dimmed'}"
         data-kind="${esc(kind)}" data-song-id="${esc(song.id)}" data-song-name="${esc(song.name)}"
         data-file-id="${file ? esc(file.id) : ''}" data-mime="${file ? esc(file.mimeType || '') : ''}" data-student="${esc(studentName)}">
      <span class="row-icon">${icon}</span>
      <span class="row-label">${esc(label)}</span>
      <span class="row-play">▶</span>
    </div>`;
}

function wireSongCardRows(songs) {
  app().querySelectorAll('.song-card-row').forEach(row => {
    row.addEventListener('click', async e => {
      e.stopPropagation();
      const { kind, songId, songName, fileId, student, mime } = row.dataset;
      const roleLabel = kind === 'teacher' ? 'Teacher' : student;
      if (fileId) {
        if (isVideoMime(mime)) {
          playInlineCardVideo(row, fileId);
        } else {
          playSingleTrack(songName, roleLabel, fileId);
        }
        return;
      }
      try { await ensureAuth(); } catch (err) { showError(err.message); return; }
      const presetSong = { id: songId, name: songName };
      if (kind === 'teacher') {
        startWizard({ presetType: 'teacher-audio', presetSong, songs });
      } else {
        const presetStudent = cachedStudents.find(s => s.name === student);
        startWizard({ presetType: 'student-practice', presetStudent, presetSong, songs });
      }
    });
  });
}

// --- Views ---


async function showSongList() {
  app().innerHTML = `<div class="loading">Loading songs…</div>`;
  revokeBlobs();
  stopCardVideo();
  try {
    const q = encodeURIComponent(
      `'${ACTIVE_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
    );
    const [songData, gods] = await Promise.all([
      readJSON(`files?q=${q}&fields=files(id,name,properties)&orderBy=name`),
      fetchGodsData(),
    ]);
    const songs = (songData.files || []).filter(f => f.name !== '_Gods');
    cachedSongsList = songs;
    wireHeaderPlayButtons(songs);

    if (!songs.length) {
      app().innerHTML = `
        ${godFilterRowHtml(gods)}
        <div class="empty-state">
          <p>No bhajans found.</p>
          <button class="btn-add-cta write-only" id="cta-first">+ Add your first bhajan</button>
        </div>`;
      wireGodFilter([], gods);
      document.getElementById('cta-first').onclick = async () => {
        try { await ensureAuth(); } catch (e) { showError(e.message); return; }
        startWizard({ songs: [] });
      };
      return;
    }

    const songFiles = await Promise.all(songs.map(async s => {
      const fq = encodeURIComponent(`'${s.id}' in parents and trashed=false`);
      const fdata = await readJSON(`files?q=${fq}&fields=files(id,name,mimeType)`);
      return fdata.files || [];
    }));

    app().innerHTML = `
      <div class="list-header">
        <h2 class="section-heading">🎵 Bhajans</h2>
        ${addContentBtnHtml()}
      </div>
      ${godFilterRowHtml(gods)}
      <div class="song-grid">
        ${songs.map((s, idx) => {
          const songGod = s.properties?.god || '';
          const godObj = gods.find(g => g.name === songGod);
          const borderColor = songGod ? (GOD_COLORS[songGod] || GOD_COLORS._default) : '#E0E0E0';
          const badgeHtml = godObj ? `
            <div class="song-card-god-badge">
              ${godAvatarHtml(godObj, 'song-card-god-img')}
            </div>` : '';
          const displayStyle = activeGodFilter && songGod !== activeGodFilter ? 'display:none;' : '';
          const files = songFiles[idx];
          const teacherFile = files.find(f => f.name.toLowerCase().startsWith('teacher-audio'));
          const rowsHtml = [
            songCardRowHtml('teacher', '🎤', 'Teacher', teacherFile, s),
            ...cachedStudents.map(student =>
              songCardRowHtml('student', genderIcon(student.gender), student.name, matchStudentFile(files, student.name), s, student.name)
            ),
          ].join('');
          return `
            <div class="song-card" data-id="${esc(s.id)}" data-name="${esc(s.name)}" data-god="${esc(songGod)}" style="${displayStyle}border-left: 4px solid ${borderColor}">
              ${badgeHtml}
              <div class="song-card-name">${esc(s.name)}</div>
              <div class="song-card-rows">${rowsHtml}</div>
            </div>`;
        }).join('')}
      </div>`;

    document.getElementById('add-content-btn').onclick = async () => {
      try { await ensureAuth(); } catch (e) { showError(e.message); return; }
      startWizard({ songs });
    };
    wireGodFilter(songs, gods);

    app().querySelectorAll('.song-card').forEach(card =>
      card.addEventListener('click', () => showSong(card.dataset.id, card.dataset.name, songs))
    );
    wireSongCardRows(songs);

  } catch (e) {
    showError(e.message);
  }
}

async function showSong(folderId, songName, cachedSongs = null) {
  stopQueue();
  revokeBlobs();
  stopCardVideo();
  const fromSong = { id: folderId, name: songName };

  const studentSectionsHtml = cachedStudents.map((student, i) => `
    <div id="student-section-${i}" class="song-section">
      <h3 class="section-title">${genderIcon(student.gender)} ${esc(student.name)}'s Practice</h3>
      <div id="student-content-${i}">
        <span id="student-status-${i}" class="loading-inline">Loading…</span>
      </div>
    </div>`).join('');

  app().innerHTML = `
    <div class="song-view-header">
      <button class="back-btn" id="back-btn">← Bhajans</button>
      ${addContentBtnHtml()}
    </div>
    <div class="song-title-row">
      <h2 class="song-title">
        <span id="song-title-text">${esc(songName)}</span>
        <button class="title-edit-btn write-only" id="title-edit-btn" title="Rename">✏️</button>
      </h2>
      <div id="god-tag-row"></div>
    </div>
    <div id="teacher-audio-section" class="song-section">
      <h3 class="section-title">🎵 Teacher Audio</h3>
      <span id="teacher-audio-status" class="loading-inline">Loading…</span>
    </div>
    ${studentSectionsHtml}
    <div id="notes-section" class="song-section">
      <h3 class="section-title">Notes</h3>
      <span class="loading-inline">Loading…</span>
    </div>
    <div id="meaning-section" class="song-section">
      <h3 class="section-title">Meaning</h3>
      <span class="loading-inline">Loading…</span>
    </div>
    <div id="teacher-notes-section" class="song-section">
      <h3 class="section-title">📝 Teacher's Notes</h3>
      <span id="teacher-notes-status" class="loading-inline">Loading…</span>
    </div>`;

  document.getElementById('back-btn').addEventListener('click', () => showSongList());
  document.getElementById('add-content-btn').onclick = async () => {
    try { await ensureAuth(); } catch (e) { showError(e.message); return; }
    startWizard({ fromSong, songs: cachedSongs, presetSong: fromSong });
  };
  document.getElementById('title-edit-btn').onclick = async () => {
    try { await ensureAuth(); } catch (e) { showError(e.message); return; }
    showTitleEditInline();
  };

  function showTitleEditInline() {
    const titleTextEl = document.getElementById('song-title-text');
    const prevHtml = titleTextEl.innerHTML;
    titleTextEl.innerHTML = `<input type="text" id="song-title-input" class="song-title-input" value="${esc(songName)}" maxlength="100">`;
    const input = document.getElementById('song-title-input');
    input.focus();
    input.select();

    let saved = false;
    async function save() {
      if (saved) return;
      const newName = input.value.trim();
      if (!newName || newName === songName) { saved = true; titleTextEl.innerHTML = prevHtml; return; }
      saved = true;
      try {
        await renameFile(folderId, newName);
        songName = newName;
        fromSong.name = newName;
        titleTextEl.textContent = newName;
      } catch (e) {
        showError(e.message);
        titleTextEl.innerHTML = prevHtml;
      }
    }
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); save(); }
      if (e.key === 'Escape') { saved = true; titleTextEl.innerHTML = prevHtml; }
    });
    input.addEventListener('blur', save);
  }

  try {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    const [data, folderMeta] = await Promise.all([
      readJSON(`files?q=${q}&fields=files(id,name,mimeType)`),
      readJSON(`files/${folderId}?fields=properties`),
    ]);
    const files = data.files || [];
    const godTag = folderMeta.properties?.god || null;
    renderGodTagSection(folderId, songName, godTag, cachedSongs);

    const teacherAudio = files.find(f => f.name.toLowerCase().startsWith('teacher-audio'));
    const teacherNotes = files.find(f => f.name.toLowerCase().startsWith('teacher-notes'));

    // Teacher audio section
    const teacherAudioEl = document.getElementById('teacher-audio-section');
    if (!teacherAudio) {
      document.getElementById('teacher-audio-status').outerHTML = `
        <p class="hint">No teacher audio yet.</p>
        <button class="btn-add-cta write-only" id="cta-teacher-audio">+ Add teacher audio</button>`;
      document.getElementById('cta-teacher-audio').onclick = async () => {
        try { await ensureAuth(); } catch (e) { showError(e.message); return; }
        startWizard({ fromSong, songs: cachedSongs, presetType: 'teacher-audio', presetSong: fromSong });
      };
    } else {
      document.getElementById('teacher-audio-status').remove();
      teacherAudioEl.insertAdjacentHTML('beforeend',
        `<audio controls src="${driveMediaUrl(`files/${teacherAudio.id}?alt=media`)}" class="audio-player"></audio>`);
    }

    for (let i = 0; i < cachedStudents.length; i++) {
      await renderStudentPracticeSection(i, cachedStudents[i], files, fromSong, cachedSongs);
    }

    const notesFile = files.find(f => f.name.toLowerCase().startsWith('notes'));
    const meaningFile = files.find(f => f.name.toLowerCase().startsWith('meaning'));
    await renderTextSection('notes-section', 'notes', 'Notes', notesFile, folderId);
    await renderTextSection('meaning-section', 'meaning', 'Meaning', meaningFile, folderId);

    // Teacher's notes (photo) section — deliberately last on the page
    const teacherNotesEl = document.getElementById('teacher-notes-section');
    if (!teacherNotes) {
      document.getElementById('teacher-notes-status').outerHTML = `
        <p class="hint">No notes photo yet.</p>
        <button class="btn-add-cta write-only" id="cta-teacher-notes">+ Add notes photo</button>`;
      document.getElementById('cta-teacher-notes').onclick = async () => {
        try { await ensureAuth(); } catch (e) { showError(e.message); return; }
        startWizard({ fromSong, songs: cachedSongs, presetType: 'teacher-notes', presetSong: fromSong });
      };
    } else {
      document.getElementById('teacher-notes-status').remove();
      teacherNotesEl.insertAdjacentHTML('beforeend',
        `<img src="${driveMediaUrl(`files/${teacherNotes.id}?alt=media`)}" class="notes-img" alt="Teacher notes">`);
    }

  } catch (e) {
    showError(e.message);
  }
}

// --- Practice recording tags (sidecar JSON per song+student) ---
//
// Emotion/star tags live in their own small JSON file per song per student —
// `student-{name}-practice-tags.json`, a sibling of the practice recording itself
// in the song folder — rather than encoded into the recording's filename. Tags
// change over time (re-rating a take after hearing it again later) and a
// filename approach would mean a Drive rename on every edit plus fragile
// parsing; a JSON sidecar is a fast, isolated write and keeps the practice
// file's own name/extension untouched. Same "Drive properties / small JSON,
// not encoded into names" convention as god tags and student properties.
//
// Shape: { revisions: { [revisionId]: { emotions: [...], stars: 1-5, review: "..." } } }
// All three fields are fully independent and optional — any combination, or
// (no entry at all) none of them.

function tagsFileName(studentName) {
  return `student-${studentName}-practice-tags.json`;
}

// Read-only, uses the API key like meaning.txt/notes.txt — no auth required.
// Returns { fileId: null, tags: { revisions: {} } } if the sidecar doesn't exist yet.
async function fetchTagsFile(songFolderId, studentName) {
  const targetName = tagsFileName(studentName).toLowerCase();
  try {
    const q = encodeURIComponent(`'${songFolderId}' in parents and trashed=false`);
    const data = await readJSON(`files?q=${q}&fields=files(id,name)`);
    const file = (data.files || []).find(f => f.name.toLowerCase() === targetName);
    if (!file) return { fileId: null, tags: { revisions: {} } };
    const text = await readText(`files/${file.id}?alt=media`);
    let parsed = {};
    try { parsed = JSON.parse(text); } catch (_) { /* corrupt/empty — treat as untagged */ }
    return { fileId: file.id, tags: { revisions: parsed.revisions || {} } };
  } catch (_) {
    return { fileId: null, tags: { revisions: {} } };
  }
}

// Sets (or clears) one revision's tags. An empty result (no emotions, no stars,
// no review) deletes that revision's entry entirely rather than storing `{}`.
// Always re-fetches current tags first (rather than trusting caller-held state)
// so rapid taps never clobber a concurrent edit — write-gated behind
// ensureAuth() by every call site. Mirrors saveTextContent()'s files.update-if-
// exists-else-files.create pattern; doesn't need keepRevisionForever since only
// this file's *current* content matters, never its own revision history.
async function saveRevisionTags(songFolderId, studentName, revisionId, { emotions = [], stars, review } = {}) {
  const { fileId, tags } = await fetchTagsFile(songFolderId, studentName);
  const revisions = { ...tags.revisions };
  const trimmedReview = (review || '').trim();
  if (!emotions.length && !stars && !trimmedReview) {
    delete revisions[revisionId];
  } else {
    const entry = {};
    if (emotions.length) entry.emotions = emotions;
    if (stars) entry.stars = stars;
    if (trimmedReview) entry.review = trimmedReview;
    revisions[revisionId] = entry;
  }
  const newTags = { revisions };
  const blob = new Blob([JSON.stringify(newTags)], { type: 'application/json' });
  let newFileId = fileId;
  if (fileId) {
    await driveUpload({ mimeType: 'application/json' }, blob, fileId);
  } else {
    const file = await driveUpload(
      { name: tagsFileName(studentName), mimeType: 'application/json', parents: [songFolderId] },
      blob
    );
    newFileId = file.id;
  }
  return { fileId: newFileId, tags: newTags };
}

function tagSummaryText(tagsByRevision, revisionId) {
  const t = tagsByRevision[revisionId];
  if (!t) return '';
  const stars = t.stars ? '★'.repeat(t.stars) + '☆'.repeat(5 - t.stars) : '';
  const emojis = (t.emotions || []).map(id => EMOTION_POOL.find(e => e.id === id)?.emoji || '').join('');
  const reviewMark = t.review ? '📝' : '';
  const parts = [stars, emojis, reviewMark].filter(Boolean);
  return parts.length ? ' ' + parts.join(' ') : '';
}

// Re-entrant: safe to call again on an already-rendered section (e.g. after a revision restore),
// since it always resets student-content-${index} back to a fresh loading state first.
async function renderStudentPracticeSection(index, student, files, fromSong, cachedSongs) {
  const contentEl = document.getElementById(`student-content-${index}`);
  if (!contentEl) return;
  contentEl.innerHTML = `<span id="student-status-${index}" class="loading-inline">Loading…</span>`;
  const statusEl = document.getElementById(`student-status-${index}`);

  const studentFile = matchStudentFile(files, student.name);

  if (!studentFile) {
    statusEl.outerHTML = `
      <p class="hint">No practice take yet.</p>
      <button class="btn-add-cta write-only" id="cta-practice-${index}">+ Add a practice take</button>`;
    document.getElementById(`cta-practice-${index}`).onclick = async () => {
      try { await ensureAuth(); } catch (e) { showError(e.message); return; }
      startWizard({ fromSong, songs: cachedSongs, presetType: 'student-practice', presetStudent: student, presetSong: fromSong });
    };
    return;
  }

  const latestUrl = driveMediaUrl(`files/${studentFile.id}?alt=media`);
  let revisions = [];
  try {
    const revData = accessToken
      ? await apiJSON(`files/${studentFile.id}/revisions?fields=revisions(id,modifiedTime,keepForever,mimeType)`)
      : await readJSON(`files/${studentFile.id}/revisions?fields=revisions(id,modifiedTime,keepForever,mimeType)`);
    revisions = (revData.revisions || []).reverse();
  } catch (_) {
    // revisions.list requires OAuth; anonymous visitors see latest only, no picker
  }
  const latestRevId = revisions[0]?.id;

  // Tags fetched alongside revisions so they're available the moment the picker renders.
  let tagsFileId = null;
  let tagsByRevision = {};
  try {
    const tagsResult = await fetchTagsFile(fromSong.id, student.name);
    tagsFileId = tagsResult.fileId;
    tagsByRevision = tagsResult.tags.revisions;
  } catch (_) {
    // best-effort — an unreadable sidecar just means no tags render, not a page error
  }

  const DAY_MS = 86_400_000;
  let ageWarning = '';
  if (revisions[0] && !revisions[0].keepForever) {
    const ageDays = Math.floor((Date.now() - new Date(revisions[0].modifiedTime)) / DAY_MS);
    if (ageDays >= 25) {
      ageWarning = `<p class="age-warning">⚠️ This take is ${ageDays} days old — open Drive → version history → ⋮ → Keep forever to prevent auto-deletion.</p>`;
    }
  }

  const isVideo = isVideoMime(studentFile.mimeType);
  const audioId = `student-audio-${index}`;
  statusEl.remove();
  contentEl.insertAdjacentHTML('beforeend', `
    ${ageWarning}
    ${isVideo
      ? `<video controls playsinline id="${audioId}" src="${latestUrl}" class="video-player"></video>`
      : `<audio controls id="${audioId}" src="${latestUrl}" class="audio-player"></audio>`}
    <div id="tag-current-${index}"></div>
    ${revisions.length <= 1 ? `
      <div class="practice-file-actions write-only">
        <button class="rev-action-btn rev-action-danger" id="practice-delete-${index}">🗑️ Delete this recording</button>
      </div>` : ''}
    <div id="rev-container-${index}"></div>`);

  // Whole-file delete only makes sense with no revision history to fall back to (restore-then-
  // delete-the-old-head, below) — with 2+ takes, use that flow instead of nuking the file outright.
  if (revisions.length <= 1) {
    document.getElementById(`practice-delete-${index}`).onclick = async () => {
      try { await ensureAuth(); } catch (e) { showError(e.message); return; }
      if (!confirm(`Delete ${student.name}'s practice take for this song? It'll move to Drive's trash and can be restored from there if needed.`)) return;
      const btn = document.getElementById(`practice-delete-${index}`);
      btn.disabled = true; btn.textContent = 'Deleting…';
      try {
        await driveTrashFile(studentFile.id);
        const remainingFiles = files.filter(f => f.id !== studentFile.id);
        await renderStudentPracticeSection(index, student, remainingFiles, fromSong, cachedSongs);
      } catch (e) {
        showError(e.message);
        btn.disabled = false; btn.textContent = '🗑️ Delete this recording';
      }
    };
  }

  const revLabel = (r, isHead) => {
    const label = new Date(r.modifiedTime).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    return isHead ? `Latest — ${label}` : label;
  };

  // --- Tag control: lives next to the player itself, not inside the "Earlier takes"
  // dropdown — so it's reachable even for a take with only one revision (the dropdown
  // never renders in that case, which is the common case for a freshly uploaded take).
  // Targets whichever revision is currently loaded in the player: the head by default,
  // retargeted to an older take once picked from the dropdown below (if it exists at all).
  // Requires knowing the loaded revision's real ID, which needs revisions.list (OAuth) —
  // so for anonymous visitors this control simply doesn't render, same as the picker.
  let currentRevisionId = latestRevId;
  let tagPanelOpen = false;

  function mountTagControl() {
    const mount = document.getElementById(`tag-current-${index}`);
    if (!mount) return;
    if (!currentRevisionId) { mount.innerHTML = ''; return; }

    const current = tagsByRevision[currentRevisionId] || {};
    const summary = tagSummaryText(tagsByRevision, currentRevisionId).trim();
    // Review is a read affordance, not a write one — shown whenever this revision has
    // one, regardless of whether the tag panel is open, so it surfaces just by viewing
    // that take (not marked write-only, unlike the button that edits it).
    mount.innerHTML = `
      <div class="tag-current-row write-only">
        <button class="rev-tag-btn" id="tag-current-btn-${index}" title="Tag this take">🏷️</button>
        ${summary ? `<span class="tag-current-summary">${summary}</span>` : ''}
      </div>
      ${current.review ? `<p class="tag-review-display">${esc(current.review)}</p>` : ''}
      <div id="tag-panel-${index}"></div>`;

    document.getElementById(`tag-current-btn-${index}`).onclick = async () => {
      try { await ensureAuth(); } catch (e) { showError(e.message); return; }
      tagPanelOpen = !tagPanelOpen;
      renderTagPanel();
    };

    if (tagPanelOpen) renderTagPanel();
  }

  // Lightweight inline panel (not the full wizard-shell modal). Emotions/stars write
  // immediately on tap; the review textarea has an explicit Save (free text shouldn't
  // fire a network write per keystroke) — either way every write goes through
  // applyTagUpdate, which reflects the confirmed saved state back into the panel and
  // the "currently viewing" display, not a pre-save guess.
  function renderTagPanel() {
    const tagPanelEl = document.getElementById(`tag-panel-${index}`);
    if (!tagPanelEl) return;
    if (!tagPanelOpen) { tagPanelEl.innerHTML = ''; return; }

    const current = tagsByRevision[currentRevisionId] || {};
    const emotions = current.emotions || [];
    const stars = current.stars || 0;

    tagPanelEl.innerHTML = `
      <div class="tag-panel">
        <div class="tag-panel-row">
          ${EMOTION_POOL.map(em => `
            <button type="button" class="tag-emotion-btn" data-emotion="${em.id}"
              aria-pressed="${emotions.includes(em.id)}" title="${esc(em.label)}">${em.emoji}</button>`).join('')}
        </div>
        <div class="tag-panel-row tag-stars-row">
          ${[1, 2, 3, 4, 5].map(n => `
            <button type="button" class="tag-star-btn" data-star="${n}"
              aria-pressed="${n <= stars}">${n <= stars ? '★' : '☆'}</button>`).join('')}
        </div>
        <textarea class="tag-review-input" id="tag-review-input-${index}"
          placeholder="Write a review of this take…" maxlength="1000">${esc(current.review || '')}</textarea>
        <button type="button" class="rev-action-btn" id="tag-review-save-${index}">💾 Save review</button>
        <button type="button" class="rev-action-btn" id="tag-panel-done-${index}">Done</button>
      </div>`;

    tagPanelEl.querySelectorAll('.tag-emotion-btn').forEach(btn => {
      btn.onclick = () => {
        const id = btn.dataset.emotion;
        const cur = tagsByRevision[currentRevisionId]?.emotions || [];
        const next = cur.includes(id) ? cur.filter(e => e !== id) : [...cur, id];
        applyTagUpdate({
          emotions: next,
          stars: tagsByRevision[currentRevisionId]?.stars,
          review: tagsByRevision[currentRevisionId]?.review,
        });
      };
    });

    // Tapping the currently-set star again clears the rating back to unset.
    tagPanelEl.querySelectorAll('.tag-star-btn').forEach(btn => {
      btn.onclick = () => {
        const n = parseInt(btn.dataset.star, 10);
        const curStars = tagsByRevision[currentRevisionId]?.stars;
        const nextStars = curStars === n ? undefined : n;
        applyTagUpdate({
          emotions: tagsByRevision[currentRevisionId]?.emotions || [],
          stars: nextStars,
          review: tagsByRevision[currentRevisionId]?.review,
        });
      };
    });

    document.getElementById(`tag-review-save-${index}`).onclick = async () => {
      const btn = document.getElementById(`tag-review-save-${index}`);
      const text = document.getElementById(`tag-review-input-${index}`).value;
      btn.disabled = true; btn.textContent = 'Saving…';
      await applyTagUpdate({
        emotions: tagsByRevision[currentRevisionId]?.emotions || [],
        stars: tagsByRevision[currentRevisionId]?.stars,
        review: text,
      });
    };

    document.getElementById(`tag-panel-done-${index}`).onclick = () => {
      tagPanelOpen = false;
      renderTagPanel();
    };
  }

  async function applyTagUpdate(tagUpdate) {
    try {
      const result = await saveRevisionTags(fromSong.id, student.name, currentRevisionId, tagUpdate);
      tagsFileId = result.fileId;
      tagsByRevision = result.tags.revisions;
      mountTagControl();
      updateRevOptionText(currentRevisionId);
    } catch (e) {
      showError(e.message);
    }
  }

  // Keeps an already-rendered dropdown option's tag summary in sync after a save,
  // without rebuilding the whole <select> (which would lose the current selection).
  function updateRevOptionText(revisionId) {
    const select = document.getElementById(`rev-picker-${index}`);
    if (!select) return;
    const rev = revisions.find(r => r.id === revisionId);
    const opt = Array.from(select.options).find(o => o.value === revisionId);
    if (opt && rev) {
      const flag = rev.keepForever ? ' ✓' : '';
      opt.textContent = `${revLabel(rev, rev.id === latestRevId)}${flag}${tagSummaryText(tagsByRevision, revisionId)}`;
    }
  }

  mountTagControl();

  function renderRevisionPicker() {
    const container = document.getElementById(`rev-container-${index}`);
    if (!container) return;
    if (revisions.length <= 1) { container.innerHTML = ''; return; }

    const revOptions = revisions.map((r, i) => {
      const flag = r.keepForever ? ' ✓' : '';
      return `<option value="${esc(r.id)}">${revLabel(r, i === 0)}${flag}${tagSummaryText(tagsByRevision, r.id)}</option>`;
    }).join('');

    container.innerHTML = `
      <div class="revision-row">
        <label class="rev-label">Earlier takes:</label>
        <select id="rev-picker-${index}" class="rev-select">${revOptions}</select>
      </div>
      <div class="revision-actions write-only" id="rev-actions-${index}">
        <p class="hint rev-actions-hint" id="rev-actions-hint-${index}">Select an earlier take above to restore or delete it.</p>
        <button class="rev-action-btn" id="rev-restore-${index}">↩️ Restore this take</button>
        <button class="rev-action-btn rev-action-danger" id="rev-delete-${index}">🗑️ Delete this take</button>
      </div>`;

    const select = document.getElementById(`rev-picker-${index}`);
    const audioEl = document.getElementById(audioId);
    const hintEl = document.getElementById(`rev-actions-hint-${index}`);
    const restoreBtn = document.getElementById(`rev-restore-${index}`);
    const deleteBtn = document.getElementById(`rev-delete-${index}`);

    const updateActionState = () => {
      const isHead = select.value === latestRevId;
      hintEl.style.display = isHead ? '' : 'none';
      restoreBtn.style.display = isHead ? 'none' : '';
      deleteBtn.style.display = isHead ? 'none' : '';
    };
    updateActionState();

    select.addEventListener('change', function() {
      const url = this.value === latestRevId
        ? latestUrl
        : driveMediaUrl(`files/${studentFile.id}/revisions/${this.value}?alt=media`);
      audioEl.src = url;
      audioEl.load();
      updateActionState();
      // Retarget the tag control (next to the player) to whatever's now loaded — closing
      // rather than re-rendering an already-open panel, so there's never ambiguity about
      // which take is being tagged.
      currentRevisionId = this.value;
      tagPanelOpen = false;
      mountTagControl();
    });

    restoreBtn.onclick = async () => {
      try { await ensureAuth(); } catch (e) { showError(e.message); return; }
      if (!confirm("Make this the current take? Today's recording will move into history, not be deleted.")) return;
      const revisionId = select.value;
      restoreBtn.disabled = true; restoreBtn.textContent = 'Restoring…';
      try {
        const resp = await apiFetch(`${BASE}/files/${studentFile.id}/revisions/${revisionId}?alt=media`);
        const blob = await resp.blob();
        const rev = revisions.find(r => r.id === revisionId);
        await driveUpload({ mimeType: rev?.mimeType || studentFile.mimeType }, blob, studentFile.id);

        // Restore creates a *new* head revision with a new Drive-assigned ID — copy this
        // revision's tags forward onto it, or they'd silently vanish even though it's the
        // same take content-wise. Best-effort: never let a tag-copy failure block the restore.
        const sourceTags = tagsByRevision[revisionId];
        if (sourceTags) {
          try {
            const freshRevData = accessToken
              ? await apiJSON(`files/${studentFile.id}/revisions?fields=revisions(id,modifiedTime)`)
              : await readJSON(`files/${studentFile.id}/revisions?fields=revisions(id,modifiedTime)`);
            const freshRevisions = (freshRevData.revisions || []).slice().reverse();
            const newHeadId = freshRevisions[0]?.id;
            if (newHeadId) await saveRevisionTags(fromSong.id, student.name, newHeadId, sourceTags);
          } catch (_) { /* tags just won't carry forward — restore itself already succeeded */ }
        }

        await renderStudentPracticeSection(index, student, files, fromSong, cachedSongs);
      } catch (e) {
        showError(e.message);
        restoreBtn.disabled = false; restoreBtn.textContent = '↩️ Restore this take';
      }
    };

    deleteBtn.onclick = async () => {
      try { await ensureAuth(); } catch (e) { showError(e.message); return; }
      const revisionId = select.value;
      const rev = revisions.find(r => r.id === revisionId);
      const dateLabel = rev ? revLabel(rev, false) : 'selected';
      if (!confirm(`Permanently delete the ${dateLabel} take? This can't be undone.`)) return;
      deleteBtn.disabled = true; deleteBtn.textContent = 'Deleting…';
      try {
        await apiDelete(`files/${studentFile.id}/revisions/${revisionId}`);
        revisions = revisions.filter(r => r.id !== revisionId);
        // Clean up the now-orphaned tags entry so stale tags don't accumulate for
        // takes that no longer exist — best-effort, doesn't block the delete itself.
        if (tagsByRevision[revisionId]) {
          delete tagsByRevision[revisionId];
          try { await saveRevisionTags(fromSong.id, student.name, revisionId, {}); }
          catch (_) { /* revision delete already succeeded; tag cleanup is secondary */ }
        }
        audioEl.src = latestUrl;
        audioEl.load();
        // Playback reverts to latest — the tag control follows so it never points at a
        // now-deleted revision.
        if (currentRevisionId === revisionId) {
          currentRevisionId = latestRevId;
          tagPanelOpen = false;
          mountTagControl();
        }
        renderRevisionPicker();
      } catch (e) {
        showError(e.message);
        deleteBtn.disabled = false; deleteBtn.textContent = '🗑️ Delete this take';
      }
    };
  }

  renderRevisionPicker();
}

// --- Meaning / Notes text sections (in song detail) ---

async function saveTextContent(folderId, prefix, text, existingFileId) {
  const blob = new Blob([text], { type: 'text/plain' });
  if (existingFileId) {
    await driveUpload({ mimeType: 'text/plain' }, blob, existingFileId);
    return existingFileId;
  }
  const file = await driveUpload({ name: `${prefix}.txt`, mimeType: 'text/plain', parents: [folderId] }, blob);
  return file.id;
}

// Renders the read-only (or empty-state) view for a known fileId/text pair — no network call.
function renderTextDisplay(containerId, prefix, label, fileId, text, folderId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!fileId) {
    container.innerHTML = `
      <h3 class="section-title">${esc(label)}</h3>
      <p class="hint">No ${esc(label.toLowerCase())} added yet.</p>
      <button class="btn-add-cta write-only" id="${containerId}-add-btn">+ Add ${esc(label.toLowerCase())}</button>`;
    document.getElementById(`${containerId}-add-btn`).onclick = async () => {
      try { await ensureAuth(); } catch (e) { showError(e.message); return; }
      showTextEditForm(containerId, prefix, label, '', null, folderId);
    };
    return;
  }

  container.innerHTML = `
    <div class="text-section-header">
      <h3 class="section-title">${esc(label)}</h3>
      <button class="text-edit-btn write-only" id="${containerId}-edit-btn" title="Edit">✏️</button>
    </div>
    <p class="text-content">${esc(text)}</p>`;

  document.getElementById(`${containerId}-edit-btn`).onclick = async () => {
    try { await ensureAuth(); } catch (e) { showError(e.message); return; }
    showTextEditForm(containerId, prefix, label, text, fileId, folderId);
  };
}

// Fetches a text file's content (if any) and renders it — used once on song-view load.
async function renderTextSection(containerId, prefix, label, file, folderId) {
  if (!file) { renderTextDisplay(containerId, prefix, label, null, '', folderId); return; }
  let text = '';
  try {
    text = await readText(`files/${file.id}?alt=media`);
  } catch (e) {
    showError(e.message);
  }
  renderTextDisplay(containerId, prefix, label, file.id, text, folderId);
}

function showTextEditForm(containerId, prefix, label, currentText, fileId, folderId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = `
    <h3 class="section-title">${esc(label)}</h3>
    <textarea class="text-edit-area" id="${containerId}-textarea" placeholder="Write ${esc(label.toLowerCase())} here…">${esc(currentText)}</textarea>
    <div class="confirm-btns" style="margin-top:8px">
      <button class="btn-primary" id="${containerId}-save-btn">Save</button>
      <button class="back-btn" id="${containerId}-cancel-btn">Cancel</button>
    </div>`;

  document.getElementById(`${containerId}-cancel-btn`).onclick = () => {
    renderTextDisplay(containerId, prefix, label, fileId, currentText, folderId);
  };

  document.getElementById(`${containerId}-save-btn`).onclick = async () => {
    const btn = document.getElementById(`${containerId}-save-btn`);
    const newText = document.getElementById(`${containerId}-textarea`).value;
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      const savedFileId = await saveTextContent(folderId, prefix, newText, fileId);
      renderTextDisplay(containerId, prefix, label, savedFileId, newText, folderId);
    } catch (e) {
      showError(e.message);
      btn.disabled = false; btn.textContent = 'Save';
    }
  };
}

// --- God tag section (in song detail) ---

function renderGodTagSection(folderId, songName, godTag, cachedSongs) {
  const container = document.getElementById('god-tag-row');
  if (!container) return;
  const gods = cachedGods || [];
  const godObj = godTag ? gods.find(g => g.name === godTag) : null;

  container.innerHTML = `
    <div class="god-tag-section">
      ${godObj ? `
        <div class="god-tag-display">
          <div class="god-tag-avatar">
            ${godAvatarHtml(godObj)}
          </div>
          <span class="god-tag-name">${esc(godObj.name)}</span>
          <button class="god-tag-btn write-only" id="god-tag-change">Change</button>
        </div>` : `
        <button class="god-tag-btn god-tag-btn-add write-only" id="god-tag-add">🙏 Tag with god</button>`}
    </div>`;

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
      try { await ensureAuth(); } catch (e) { showError(e.message); return; }
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
  if (pickerAddBtn) pickerAddBtn.onclick = async () => {
    try { await ensureAuth(); } catch (e) { showError(e.message); return; }
    showAddGodForm({ id: folderId, name: songName }, cachedSongs);
  };
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
          blobUrl = URL.createObjectURL(addGodBlob);
          godBlobUrls.push(blobUrl);
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

// --- Student settings ---

async function saveStudents(updated) {
  await driveUpdateProperties(ACTIVE_FOLDER_ID, {
    students: JSON.stringify(updated),
    childName: null, gender: null, age: null, // complete migration off the legacy single-child schema
  });
  cachedStudents = updated;
  applyHeaderUI();
  if (cachedSongsList) wireHeaderPlayButtons(cachedSongsList);
}

function showSettings() {
  app().innerHTML = wizardShell(`
    <h3 class="wizard-title">Students</h3>
    <div class="settings-form">
      <div class="student-list" id="student-list"></div>
      <button class="btn-add-cta" id="add-student-btn" style="margin-top:12px">+ Add Student</button>
    </div>`);

  document.getElementById('wizard-cancel').onclick = showSongList;
  renderStudentList();
  document.getElementById('add-student-btn').onclick = () => showStudentForm(null);
}

function renderStudentList() {
  const list = document.getElementById('student-list');
  if (!list) return;
  if (!cachedStudents.length) {
    list.innerHTML = `<p class="hint">No students yet — add one below.</p>`;
    return;
  }
  list.innerHTML = cachedStudents.map((s, i) => `
    <div class="student-row-item">
      <span class="student-row-icon">${genderIcon(s.gender)}</span>
      <span class="student-row-name">${esc(s.name)}</span>
      <span class="student-row-age">${s.age ? `${esc(s.age)}y` : ''}</span>
      <button class="student-edit-btn" data-index="${i}" title="Edit">✏️</button>
      <button class="student-remove-btn" data-index="${i}" title="Remove">🗑️</button>
    </div>`).join('');

  list.querySelectorAll('.student-edit-btn').forEach(btn => {
    btn.onclick = () => showStudentForm(Number(btn.dataset.index));
  });
  list.querySelectorAll('.student-remove-btn').forEach(btn => {
    btn.onclick = async () => {
      const idx = Number(btn.dataset.index);
      const student = cachedStudents[idx];
      if (!confirm(`Remove ${student.name}? This won't delete their existing recordings from Drive.`)) return;
      try {
        await saveStudents(cachedStudents.filter((_, i) => i !== idx));
        renderStudentList();
      } catch (e) {
        showError(e.message);
      }
    };
  });
}

function showStudentForm(editIndex) {
  const isEdit = editIndex !== null && editIndex !== undefined;
  const student = isEdit ? cachedStudents[editIndex] : { name: '', gender: '', age: '' };
  let selectedGender = student.gender;

  app().innerHTML = wizardShell(`
    <h3 class="wizard-title">${isEdit ? 'Edit student' : 'Add student'}</h3>
    <div class="settings-form">
      <label class="add-god-label">Name</label>
      <input type="text" id="student-name-input" class="new-song-input" placeholder="e.g. Rudvik" maxlength="60" value="${esc(student.name)}">
      ${isEdit ? `<p class="hint" id="rename-warning" style="display:none">⚠️ Renaming won't move existing recordings — they'll stay filed under the old name until re-recorded.</p>` : ''}
      <label class="add-god-label" style="margin-top:12px">Gender</label>
      <div class="gender-picker">
        <button type="button" class="gender-btn" data-gender="girl">Girl</button>
        <button type="button" class="gender-btn" data-gender="boy">Boy</button>
        <button type="button" class="gender-btn" data-gender="other">Other</button>
      </div>
      <label class="add-god-label" style="margin-top:12px">Age</label>
      <input type="number" id="student-age-input" class="new-song-input" min="1" max="18" value="${esc(student.age || '')}">
      <div class="confirm-btns" style="margin-top:16px">
        <button class="btn-primary" id="student-save-btn">${isEdit ? 'Save changes' : 'Add student'}</button>
        <button class="back-btn" id="student-form-cancel">Cancel</button>
      </div>
    </div>`);

  document.getElementById('wizard-cancel').onclick = showSettings;
  document.getElementById('student-form-cancel').onclick = showSettings;

  const genderBtns = app().querySelectorAll('.gender-btn');
  const updateGenderUI = () => genderBtns.forEach(b => b.classList.toggle('active', b.dataset.gender === selectedGender));
  updateGenderUI();
  genderBtns.forEach(b => b.onclick = () => { selectedGender = b.dataset.gender; updateGenderUI(); });

  if (isEdit) {
    const nameInput = document.getElementById('student-name-input');
    const warning = document.getElementById('rename-warning');
    nameInput.addEventListener('input', () => {
      warning.style.display = nameInput.value.trim() !== student.name ? 'block' : 'none';
    });
  }

  document.getElementById('student-save-btn').onclick = async () => {
    const name = document.getElementById('student-name-input').value.trim();
    if (!name) return;
    const age = document.getElementById('student-age-input').value.trim();
    const btn = document.getElementById('student-save-btn');
    btn.disabled = true; btn.textContent = 'Saving…';
    const newStudent = { name, gender: selectedGender, age };
    const updated = isEdit
      ? cachedStudents.map((s, i) => i === editIndex ? newStudent : s)
      : [...cachedStudents, newStudent];
    try {
      await saveStudents(updated);
      showSettings();
    } catch (e) {
      showError(e.message);
      btn.disabled = false; btn.textContent = isEdit ? 'Save changes' : 'Add student';
    }
  };
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
    student: opts.presetStudent || null,
    mediaType: null,
    song: opts.presetSong || null,
    blob: null,
    mimeType: null,
    extension: null,
  };

  if (wizard.contentType) {
    proceedFromType();
  } else {
    showWizardType();
  }
}

// Decides what step comes next: student picker, then audio/video picker (practice-take only),
// then song picker, then capture.
function proceedFromType() {
  if (wizard.contentType === 'student-practice') {
    if (!wizard.student) {
      if (cachedStudents.length === 1) {
        wizard.student = cachedStudents[0];
      } else {
        showWizardStudent();
        return;
      }
    }
    if (!wizard.mediaType) {
      showWizardMediaType();
      return;
    }
  }
  wizard.song ? showWizardCapture() : showWizardSong();
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
        <span class="type-label">${cachedStudents.length === 1 ? `${esc(cachedStudents[0].name)}'s practice take` : 'Practice take'}</span>
      </button>
    </div>`);

  document.getElementById('wizard-cancel').onclick = cancelWizard;
  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.onclick = () => {
      wizard.contentType = btn.dataset.type;
      proceedFromType();
    };
  });
}

function showWizardMediaType() {
  app().innerHTML = wizardShell(`
    <h3 class="wizard-title">Audio or video?</h3>
    <div class="type-options">
      <button class="type-btn" data-media="audio">
        <span class="type-icon">🎤</span>
        <span class="type-label">Audio</span>
      </button>
      <button class="type-btn" data-media="video">
        <span class="type-icon">🎥</span>
        <span class="type-label">Video</span>
      </button>
    </div>`);

  document.getElementById('wizard-cancel').onclick = cancelWizard;
  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.onclick = () => {
      wizard.mediaType = btn.dataset.media;
      proceedFromType();
    };
  });
}

function showWizardStudent() {
  app().innerHTML = wizardShell(`
    <h3 class="wizard-title">Which student?</h3>
    <div class="song-options">
      <div class="new-song-row">
        <button class="song-option-btn new-song-btn" id="new-student-toggle">+ Add Student</button>
        <div class="new-song-form" id="new-student-form" style="display:none">
          <input type="text" id="new-student-input" class="new-song-input" placeholder="Student's name…" maxlength="60">
          <button class="btn-primary" id="new-student-create">Create</button>
        </div>
      </div>
      ${cachedStudents.map(s => `
        <button class="song-option-btn" data-name="${esc(s.name)}">
          ${genderIcon(s.gender)} ${esc(s.name)}
        </button>`).join('')}
    </div>`);

  document.getElementById('wizard-cancel').onclick = cancelWizard;

  document.querySelectorAll('.song-options .song-option-btn:not(.new-song-btn)').forEach(btn => {
    btn.onclick = () => {
      wizard.student = cachedStudents.find(s => s.name === btn.dataset.name);
      proceedFromType();
    };
  });

  document.getElementById('new-student-toggle').onclick = () => {
    document.getElementById('new-student-toggle').style.display = 'none';
    document.getElementById('new-student-form').style.display = 'flex';
    document.getElementById('new-student-input').focus();
  };

  document.getElementById('new-student-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('new-student-create').click();
  });

  document.getElementById('new-student-create').onclick = async () => {
    const name = document.getElementById('new-student-input').value.trim();
    if (!name) return;
    const btn = document.getElementById('new-student-create');
    btn.disabled = true; btn.textContent = 'Creating…';
    try {
      const newStudent = { name, gender: '', age: '' };
      await saveStudents([...cachedStudents, newStudent]);
      wizard.student = newStudent;
      proceedFromType();
    } catch (e) {
      btn.disabled = false; btn.textContent = 'Create';
      showError(e.message);
    }
  };
}

async function showWizardSong() {
  app().innerHTML = wizardShell(`<div class="loading">Loading songs…</div>`);
  document.getElementById('wizard-cancel').onclick = cancelWizard;

  if (!wizard.songs) {
    try {
      const q = encodeURIComponent(
        `'${ACTIVE_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
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
        parents: [ACTIVE_FOLDER_ID],
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
  const isVideo = wizard.contentType === 'student-practice' && wizard.mediaType === 'video';
  const isImage = wizard.contentType === 'teacher-notes';
  const isAudio = !isVideo && !isImage;

  app().innerHTML = wizardShell(`
    <h3 class="wizard-title">Capture content</h3>
    <p class="wizard-subtitle">
      ${typeLabel(wizard.contentType, wizard.student?.name)} for <strong>${esc(wizard.song.name)}</strong>
    </p>
    ${isAudio ? `
      <div class="capture-options" id="capture-options">
        <button class="capture-btn" id="btn-record">🎙️ Record live</button>
        <button class="capture-btn" id="btn-upload-audio">📁 Upload a file</button>
        <input type="file" id="file-audio" accept="audio/*,.m4a,.opus,.ogg,.oga,.mp3,.aac,.caf,.wav,.mp4" style="display:none">
      </div>` : ''}
    ${isVideo ? `
      <div class="capture-options" id="capture-options">
        <button class="capture-btn" id="btn-record-video">🎥 Record live</button>
        <button class="capture-btn" id="btn-upload-video">📁 Upload a file</button>
        <input type="file" id="file-video" accept="video/*,.mp4,.mov,.m4v" style="display:none">
      </div>` : ''}
    ${isImage ? `
      <div class="capture-options">
        <label class="capture-btn" for="file-image">📷 Choose / take photo</label>
        <input type="file" id="file-image" accept="image/*" style="display:none">
      </div>` : ''}
    <div class="recording-panel" id="recording-panel" style="display:none">
      <video id="record-preview" class="record-preview" autoplay muted playsinline style="display:none"></video>
      <div class="recording-indicator">
        <span class="rec-dot"></span>
        <span id="rec-timer">0:00</span>
      </div>
      <button class="btn-primary" id="btn-stop-record">Stop</button>
    </div>`);

  document.getElementById('wizard-cancel').onclick = cancelWizard;

  if (isAudio) {
    document.getElementById('btn-record').onclick = () => startMediaRecording({ audio: true }, 'audio');
    document.getElementById('btn-upload-audio').onclick = () => document.getElementById('file-audio').click();
    document.getElementById('file-audio').onchange = e => {
      const file = e.target.files[0];
      if (!file) return;
      const ext = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : 'audio';
      showWizardConfirm(file, file.type || 'audio/webm', ext);
    };
  }

  if (isVideo) {
    document.getElementById('btn-record-video').onclick = () =>
      startMediaRecording({ video: { facingMode: 'environment' }, audio: true }, 'video');
    document.getElementById('btn-upload-video').onclick = () => document.getElementById('file-video').click();
    document.getElementById('file-video').onchange = e => {
      const file = e.target.files[0];
      if (!file) return;
      const ext = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : 'mp4';
      showWizardConfirm(file, file.type || 'video/mp4', ext);
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

// Shared live-recording lifecycle for both audio (mic only) and video (camera + mic) capture.
async function startMediaRecording(constraints, kind) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    _recordingStream = stream;
    _recordingChunks = [];
    _recorder = new MediaRecorder(stream);
    _recorder.ondataavailable = e => { if (e.data.size > 0) _recordingChunks.push(e.data); };
    _recorder.start();

    const captureOptions = document.getElementById('capture-options');
    if (captureOptions) captureOptions.style.display = 'none';
    const preview = document.getElementById('record-preview');
    if (kind === 'video' && preview) {
      preview.srcObject = stream;
      preview.style.display = 'block';
    }
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
        const mimeType = _recorder.mimeType || (kind === 'video' ? 'video/webm' : 'audio/webm');
        const blob = new Blob(_recordingChunks, { type: mimeType });
        _recordingStream.getTracks().forEach(t => t.stop()); _recordingStream = null;
        _recorder = null;
        if (preview) { preview.srcObject = null; preview.style.display = 'none'; }
        const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'mp4' : 'webm';
        showWizardConfirm(blob, mimeType, ext);
      };
      if (_recorder.state !== 'inactive') _recorder.stop();
    };
  } catch (e) {
    showError(`${kind === 'video' ? 'Camera' : 'Microphone'} access denied: ` + e.message);
  }
}

function showWizardConfirm(blob, mimeType, ext) {
  wizard.blob = blob;
  wizard.mimeType = mimeType;
  wizard.extension = ext;

  const previewUrl = trackBlob(URL.createObjectURL(blob));
  const previewHtml = mimeType.startsWith('audio')
    ? `<audio controls src="${previewUrl}" class="audio-player"></audio>`
    : isVideoMime(mimeType)
    ? `<video controls playsinline src="${previewUrl}" class="video-player"></video>`
    : `<img src="${previewUrl}" class="notes-img" alt="Preview">`;

  app().innerHTML = wizardShell(`
    <h3 class="wizard-title">Does this look right?</h3>
    <p class="wizard-subtitle">
      ${typeLabel(wizard.contentType, wizard.student?.name)} for <strong>${esc(wizard.song.name)}</strong>
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
  const { contentType, song, student, blob, mimeType, extension } = wizard;
  const prefix = contentType === 'student-practice' ? `student-${student.name}-practice` : contentType;

  const q = encodeURIComponent(`'${song.id}' in parents and trashed=false`);
  const data = await apiJSON(`files?q=${q}&fields=files(id,name,mimeType)`);
  const files = data.files || [];
  const existing = contentType === 'student-practice'
    ? matchStudentFile(files, student.name)
    : files.find(f => f.name.toLowerCase().startsWith(prefix.toLowerCase()));

  if (existing) {
    await driveUpload({ mimeType }, blob, existing.id);
  } else {
    await driveUpload({ name: `${prefix}.${extension}`, mimeType, parents: [song.id] }, blob);
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

// --- Header play buttons ---

function renderHeaderPlayPills() {
  const row = document.getElementById('header-play-row');
  if (!row) return;
  const pills = [
    { mode: 'teacher', label: 'Teacher' },
    ...cachedStudents.map(s => ({ mode: 'student', label: s.name, student: s.name })),
    { mode: 'both', label: 'All' },
  ];
  row.innerHTML = pills.map(p =>
    `<button class="hdr-play-btn" data-mode="${esc(p.mode)}" data-student="${esc(p.student || '')}" disabled>▶ ${esc(p.label)}</button>`
  ).join('');
}

function wireHeaderPlayButtons(songs) {
  document.querySelectorAll('#header-play-row .hdr-play-btn').forEach(btn => {
    btn.disabled = false;
    btn.onclick = () => startQueue(songs, btn.dataset.mode, btn.dataset.student || null);
  });
}

// --- Boot ---

async function boot() {
  document.body.classList.add('anon');
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
  document.getElementById('hdr-sign-in').onclick = async () => {
    try { await ensureAuth(); } catch (e) { showError(e.message); }
  };
  document.getElementById('hdr-settings').onclick = async () => {
    try { await ensureAuth(); } catch (e) { showError(e.message); return; }
    showSettings();
  };
  await fetchFolderProfile();
  showSongList();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

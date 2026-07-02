# Nyra Learns with Nana — Monorepo Root

## Repo structure

```
<repo-root>/
  index.html           Landing page — links to each app
  shared/
    tokens.css         CSS custom properties: fonts (Nunito, Baloo 2), colors (--sun, --plum, --ink)
    nav.js             Root nav component (renderRootNav)
  english/             Phonics app — see english/CLAUDE.md
    app/               Web app (ES modules, no build step)
    worksheets/        Python PDF generator (reportlab)
    CLAUDE.md
  music/               Bhajans practice player (Drive-backed, public read / lazy OAuth for writes)
  math/                (not started — near-term)
  telugu/              (not started — no timeline)
```

## Apps

| App | Path | Status |
|---|---|---|
| English (Phonics) | `english/app/` | Live |
| Music (Bhajans) | `music/` | Live |
| Math | `math/` | Planned |
| Telugu | `telugu/` | Placeholder, no timeline |

## Commands

```bash
# Run any app locally (from repo root)
python3 -m http.server 8000
# English phonics: http://localhost:8000/english/app/
# Landing page:    http://localhost:8000/
```

## Deploy

GitHub Pages, branch `main`, source `/` (repo root). Root `index.html` is the
entry point at `vankadn.github.io/nyra-learns/`. Each app lives at its subfolder path.

## Music (Bhajans)

Lives at `music/`. Three files: `index.html`, `app.js`, `config.js`.

**Data model:** self-discovering, no JSON index. Root folder in Drive (`BHAJANS_FOLDER_ID`).
Each subfolder = one bhajan, folder name = song name. Files matched by prefix, not exact name:

| Prefix | Content |
|---|---|
| `teacher-audio.*` | Teacher's reference clip (any audio ext — .m4a, .opus, etc.) |
| `teacher-notes.*` | Photo of handwritten notes (jpg/png) |
| `student-{name}-practice.*` | That student's practice take (audio **or** video) — single file, versioned by Drive |
| `meaning.txt` | English meaning/translation of the bhajan (plain text) |
| `notes.txt` | Freeform notes — distinct from `teacher-notes.*`, which is the handwritten-notes photo |

Special sibling folder `_Gods/` (under `BHAJANS_FOLDER_ID`) stores god avatar images — filtered out of
the song list. See **God tag/filter** below.

**Auth — public read, lazy OAuth for writes:**
- **Reads** (song list, folder listing, audio, teacher notes, god avatars, revisions) use a Drive API
  key (`DRIVE_READ_API_KEY`) — no sign-in required. The app opens directly to the song list.
  Implemented via `readJSON(path)` and `driveMediaUrl(path)` helpers that append `?key={API_KEY}`.
  Media is served as direct URLs set on `<audio src>` / `<img src>` — no blob fetch, no ObjectURL.
- **Writes** trigger `ensureAuth()` on first use. `ensureAuth()` calls `requestToken()` (GIS) and
  fetches `userinfo.profile`. Subsequent writes reuse the short-lived access token; GIS re-prompts
  silently if the Google session is still active.
- OAuth scope: `drive` (full) + `userinfo.profile`. Full `drive` scope is required because most files
  were created outside the app — `drive.file` only covers app-created files.
- `findGodsFolderId()` — read-only, uses API key, returns null if `_Gods/` not yet created.
  `ensureGodsFolderId()` — write path only, calls `findGodsFolderId` first then creates if missing.

**Config:** `music/config.js` holds three values, all committed with real IDs:
```js
CLIENT_ID           // OAuth Client ID (Web application type, JS origin: https://vankadn.github.io)
BHAJANS_FOLDER_ID   // Drive folder ID from the URL of the root Bhajans folder
DRIVE_READ_API_KEY  // API key for public read access (Drive API, restricted to drive.readonly)
```
None are secrets — OAuth Client ID is visible in any browser request; Drive folder ID and API key are
in browser network requests. All committed directly. To test locally add `http://localhost:8000` as an
**Authorized JavaScript origin** on the OAuth Client ID in Google Cloud Console (~5 min to propagate).

**Add content flow:** a single "Add content" entry point (button on song list + song view, and CTAs on
empty states) handles all three content types for any song. Steps:
1. Pick content type (teacher audio, teacher notes, student practice take). Picking a practice take
   also picks *which* student when the folder has 2+ (see "Students" below) — skipped when there's
   exactly one, or when the caller already knows the student (e.g. a song-card row tap).
2. For a practice take only: pick **Audio or Video** (`showWizardMediaType()`, `wizard.mediaType`).
   Always asked — no skip logic, unlike the student step. Video recording defaults to the back
   camera (`getUserMedia({ video: { facingMode: 'environment' }, audio: true })`) — filming, not
   self-recording; no front/back toggle (deferred, revisit if a student ever self-records).
3. Pick song from existing list or create a new folder — new songs can be created directly from the app,
   no need to pre-create folders in Drive manually
4. Capture: audio/video both offer "Record live" (live timer + stop, mirrored between the two —
   video adds a live camera preview via `startMediaRecording(constraints, kind)`, the shared
   recording lifecycle both paths call) or "Upload a file"; teacher notes uses a file picker that
   lets the OS offer "Take Photo" or "Choose Existing" on mobile.

Playback branches on the Drive file's actual `mimeType` (fetched alongside every file listing,
via `isVideoMime()`) — not the extension — since `.webm`/`.mp4` containers can hold either. Song
detail practice sections, the song-card rows, and the global header queue (👧 pill / 🔀 All) all
render `<video>` instead of `<audio>` for a video take. The queue keeps two elements (`#queue-audio`,
`#queue-video`) side by side in the bar, showing/loading whichever one the current track needs and
hiding+pausing the other — `queueGoto()` picks by `track.mimeType`. Song-card rows play inline
instead: tapping a filled video row inserts a `<video controls autoplay>` right in the card
(`playInlineCardVideo`) rather than going through the shared queue bar; only one inline card video
plays at a time (`stopCardVideo()`), and starting a queue or another single-track play stops it.
**Not validated on an actual iPhone yet** — `MediaRecorder` codec support for live video recording
on iOS Safari needs real-device testing, same "laptop ≠ iOS" gap as the audio upload `accept` fix
above. No max recording duration cap by design (revisit only if upload size/time becomes a problem).

The audio upload `<input accept>` is `audio/*` plus explicit extensions
(`.m4a,.opus,.ogg,.oga,.mp3,.aac,.caf,.wav,.mp4`) — iOS's Files picker greys out files whose reported
mime type it doesn't map to `audio/*` (common for WhatsApp-exported `.opus`/`.m4a`), but keeps
extension-matched files selectable regardless of mime type. Keep both forms — don't drop the
extension list back down to bare `audio/*`, and don't remove `accept` entirely either. The teacher-
notes photo input stays `image/*` only, no extension list needed there.

After capture, a preview screen (audio player or image) lets you confirm or discard & redo before
anything touches Drive.

**Save logic (identical for all types/methods):** check if a file with the target prefix exists in the
song folder. If yes: `files.update` (PATCH) with the new content, keeping the same `fileId` for revision
history. If no: `files.create` (POST) with a name derived from the prefix + actual content extension.
Every save passes `keepRevisionForever=true` as a query param — Drive's 30-day auto-purge never applies.

**Filename/mimeType policy:** when updating an existing file, the `name` (and its extension) is
preserved unchanged — only `mimeType` is updated to match the actual new content. When creating a new
file, the extension is derived from the captured content (`.webm` for live recordings; the uploaded
file's own extension for uploads). This keeps revision history clean and avoids Drive extension/mimeType
mismatches on update.

**Versioning:** Google Drive's native file revisions — not separate files. The app reads `revisions.list`
and offers a date-labeled picker. Drive auto-purges revisions older than 30 days unless marked Keep
forever. Every save from the app sets `keepRevisionForever=true` automatically; the 25-day age warning
is still shown for any revision not yet marked (e.g. files uploaded via Drive before this feature).

The per-student practice revision picker (`renderStudentPracticeSection` → `renderRevisionPicker`,
per-song-detail only, not teacher-audio — teacher-audio has no revision picker at all today) also
supports **↩️ Restore** and **🗑️ Delete** on whichever revision is currently selected in the
dropdown, both write-only and `ensureAuth()`-gated like every other mutation. Drive has no native
"revert": Restore fetches the old revision's bytes (`revisions.get?alt=media`, authenticated) and
feeds them into the same `driveUpload(...)`-with-`keepRevisionForever=true` update path every other
save uses — same `fileId`, same name-preserved/mimeType-updated policy — which creates a **new head
revision** with the old content; nothing is deleted, the take restored *from* stays in history, and
the take that *was* current becomes a normal non-head revision. Delete (`revisions.delete`) is
permanent, no trash — and only ever offered on non-head revisions, since Drive rejects deleting the
head and a file must always have ≥1 revision; to get rid of a bad *current* take, restore a good one
first (which demotes the bad one), then delete becomes available on it. Restore re-fetches the whole
section (`renderStudentPracticeSection` is written to be safely re-entrant — it always resets its
`student-content-${index}` wrapper to a fresh loading state first) since it needs the newly-created
head revision's real ID from Drive; Delete instead just splices the deleted entry out of the
in-memory `revisions` array and calls `renderRevisionPicker()` directly, no re-fetch.

Separately, a 🗑️ **"Delete this recording"** button sits right below the player itself (not inside
the revision dropdown) — but **only when there's exactly one revision** (`revisions.length <= 1`).
That's the one case the per-revision Delete above can never cover (Drive won't let you delete a
file's only/head revision, and there's no older take to restore-then-demote-then-delete instead).
With 2+ revisions, use that restore/delete flow instead of nuking the file outright — the button
doesn't render at all in that case. This one deletes the **whole file**, via `driveTrashFile()` — a
`files.update` PATCH with `{ trashed: true }`, i.e. Drive's normal trash, recoverable from Drive —
deliberately not the permanent no-trash semantics of the per-revision Delete. On success it
re-renders the section with that file filtered out of the local `files` list, landing back on the
"No practice take yet" empty state.

**Global playback queues:** header pill buttons — 🎤 Teacher, one per student, then 🔀 All — start a
queue across all songs, **shuffled by default**. Pills are generated dynamically
(`renderHeaderPlayPills()`, see "Students" below), not fixed markup. Queue order is session-only,
never persisted. Unshuffled "All" (i.e. with the toggle turned off) = teacher clip then every
student's clip per song, alphabetical song order — that's also the underlying track-build order
shuffle reorders. Student queues always use latest revision only — no revision picker in queue
context. `queueGoto` is sync per track — sets `src` directly to `driveMediaUrl(...)` on whichever of
`#queue-audio`/`#queue-video` the track's mimeType needs (no blob fetch, no ObjectURL lifecycle; see
the video-support paragraph above for the dual-element mechanics). Header buttons are wired by
`wireHeaderPlayButtons(songs)` after `showSongList()` loads. Entering a song view stops the active
queue.

The queue bar's control row (only shown for multi-track queues, hidden for the single-track
`playSingleTrack()` case) has a 🔀 shuffle toggle to the left of ⏮/⏭ — same `.queue-ctrl-btn` class
as the transport buttons, filled with `--sun` via `[aria-pressed="true"]` when active (reusing the
existing filled-when-active pattern, e.g. `.god-chip-all.active`, rather than a new one). It shows
**pressed/active as soon as the queue starts** — `startQueue()` builds `queue.order` already
Fisher-Yates shuffled and sets `queue.shuffled = true`, so the very first track played is randomized,
not the fixed order's first track. It's a playback-order setting on the **currently active queue
only** (`queue.shuffled`), toggled by `toggleQueueShuffle()` — not a separate mode, and it never
starts/stops the queue or touches `queue.cursor`. Turning it off restores the original sequential
(track-build) order for whatever hasn't played yet, without touching what's already played; turning
it back on mid-queue Fisher-Yates-shuffles only the not-yet-played remainder of `queue.order`
(`queue.order.slice(cursor + 1)`) — everything up to and including the current track is always left
untouched either way, which is also what makes ⏮ Prev walk back through tracks in the order actually
played rather than the original sequence. No auto-loop when the queue reaches its end, matching the
pre-existing no-loop behavior. Session-only: `queue.shuffled` resets to `true` every time
`startQueue()` builds a fresh queue (`playSingleTrack()`'s single-track queue stays unshuffled —
`shuffled: false` — since there's nothing to shuffle and no toggle is shown for it); turning shuffle
off applies only to that one queue instance, never persisted or carried to the next queue start.

**Auth-aware UI:** the app opens in anonymous read-only mode (`body.anon` class set at boot). All
write surfaces carry class `write-only`; CSS rule `body.anon .write-only { display:none!important }`
hides them globally — no re-render needed on sign-in. A "👤 Sign in" button (class `anon-only`)
sits top-right in the header; clicking it calls `ensureAuth()` → on success `onSignIn()` removes
`body.anon` and populates the header user pill. Hidden write surfaces: Add content buttons, empty-
state CTAs, god filter + button, god emoji mini/edit buttons, god tag Change/Tag buttons, the ⚙️
student settings button, the ✏️ Meaning/Notes edit buttons and their "+ Add" empty-state CTAs.

**Students (multi-student support):** a folder can have any number of students (siblings sharing
one Bhajans folder). Stored as a single Drive **folder property** on the active song-parent folder
(`ACTIVE_FOLDER_ID`): `properties.students` is a JSON-stringified array of `{ name, gender, age }`
(`gender` is `'girl'|'boy'|'other'`). No new file, no new API surface — same mechanism as the god
emoji property, just one property holding serialized JSON instead of one property per field.
- **Read:** `fetchFolderProfile()` at boot parses `properties.students` via the read API key
  (`readJSON`, no auth) into `cachedStudents`. **Migration:** if `properties.students` is absent but
  the older single-child `properties.childName` (from a prior version of this app) is present, it's
  converted in-memory into a one-entry `cachedStudents` array; the legacy keys are only cleared from
  Drive the next time something writes via `saveStudents()` (settings or the wizard's inline
  "+ Add Student").
- **Write:** `saveStudents(updated)` PATCHes `{ properties: { students: JSON.stringify(updated),
  childName: null, gender: null, age: null } }` via the existing `driveUpdateProperties` helper —
  the null keys complete the migration cleanup. Called from the write-only ⚙️ settings view
  (`showSettings()` → list with edit/remove, `showStudentForm()` add/edit) and from the wizard's
  student picker when a new student is created inline. All paths gated behind `ensureAuth()`.
- **Header:** `applyHeaderUI()` shows `"{name}'s Bhajans"` only when there's exactly one student,
  else the bare `"Bhajans"` (same rule for the `<title>` tag). It also calls
  `renderHeaderPlayPills()`, which rebuilds the header's play-queue pills from scratch: Teacher,
  one pill per student, then All — replacing the old fixed 3-button markup. `wireHeaderPlayButtons`
  re-queries `#header-play-row .hdr-play-btn` and re-wires after every students-array mutation.
- **Per-student practice files:** prefix convention is `student-{name}-practice.*` (was the bare
  `student-practice.*` before multi-student support). `matchStudentFile(files, studentName)` looks
  for the name-specific prefix first, then falls back to the bare legacy prefix **only when there's
  exactly one student** — this keeps pre-existing single-child recordings visible/playable and
  correctly matched for `files.update` (preserving revision history) without any one-time file
  migration. Used consistently by the song list rows, song detail sections, queue building, and
  `saveContent()`.
- **Song cards:** each card shows one row per student below the title (plus a Teacher row), built in
  `showSongList()` from a per-song file listing fetched alongside the song list. Filled rows (file
  exists) play inline — via the shared queue-bar (`playSingleTrack()`) for audio, or a `<video>`
  inserted right in the card (`playInlineCardVideo()`) for video, chosen by the file's `mimeType`.
  Dimmed rows (`opacity: 0.3`, no file) open the Add Content wizard preset to that exact
  student/type, skipping both the type and student picker steps.
- **Song detail view:** one section per student (`renderStudentPracticeSection`), each with its own
  revision picker/age-warning, mirroring what was previously a single hardcoded section — renders
  `<video>` instead of `<audio>` when the file's `mimeType` is a video type.
- **Wizard:** picking "practice take" only shows a student picker (`showWizardStudent()`, with its
  own inline "+ Add Student") when there are 2+ students; with exactly one it's auto-selected, and
  it's skipped entirely whenever the caller already knows the student (e.g. a song-card row or a
  song-detail "+ Add a practice take" CTA for a specific student).
- Renaming a student in settings only updates `properties.students` — it deliberately does **not**
  rename any Drive files (the UI shows a warning when the name field changes), since the old
  recordings would otherwise become permanently orphaned from a mismatched prefix.

**Meaning / Notes (song detail):** two plain-text sections — `meaning.txt` (English
meaning/translation) and `notes.txt` (freeform notes, distinct from `teacher-notes.*`, which is the
handwritten-notes photo). Same self-discovering prefix pattern as everything else; read via the API
key, no auth needed. Content itself can't be included in the folder's file-listing call (Drive's
`files.list` has no way to inline a file's body), so `renderTextSection()` does one extra `alt=media`
GET per matched file via the `readText()` helper, reusing the same per-song `files` listing already
fetched for teacher/student content — no separate listing call added. Editing is inline (not the
multi-step Add Content wizard): a write-only ✏️ button swaps the section for a `<textarea>` +
Save/Cancel (`showTextEditForm`); Save calls `ensureAuth()` then `saveTextContent()`, which mirrors
the exact same `files.update`-if-exists-else-`files.create` + `keepRevisionForever=true` pattern as
every other save in this app (via the existing `driveUpload` helper). Re-renders optimistically from
the just-saved text (`renderTextDisplay`) — no re-fetch, no full reload. No revision picker for
these, same as the god tag.

**Song detail page order** (deliberate, confirmed with the user — don't reshuffle without asking):
title → god tag → 🎵 Teacher Audio (`teacher-audio-section`, audio only) → one practice section per
student → Notes (`notes.txt`) → Meaning (`meaning.txt`) → 📝 Teacher's Notes
(`teacher-notes-section`, the handwritten-notes photo — deliberately last on the page, separated from
the teacher audio section it used to share). Each of Teacher Audio and Teacher's Notes has its own
independent empty-state CTA now (`+ Add teacher audio` / `+ Add notes photo`, each presetting the
wizard's `contentType` to skip the type-picker step) — they used to be one combined "Teacher
Reference" section with a single generic CTA covering both.

**Song title rename:** a write-only ✏️ button next to the title (`title-edit-btn`) swaps
`#song-title-text` for a text input, same Enter/Escape/blur inline-edit pattern as
`showEmojiInputInline`. Save calls `renameFile(folderId, name)` — a plain `files.update` PATCH with
`{ name }` (the song folder's Drive folder name *is* the song name, no separate title field) — then
updates `songName` and `fromSong.name` in place so every closure already wired in this `showSong()`
call (Add content, teacher/student empty-state CTAs, etc.) picks up the new name immediately. Other
cached song lists (the song-list grid, an open wizard's song picker) go stale until their next fetch,
same as every other rename in this app (e.g. student rename) — no special propagation.

**God tag/filter:** songs can be tagged with a god (Ganesha, Shiva, Krishna, etc.).

- `_Gods/` folder is a sibling to song folders under `BHAJANS_FOLDER_ID`. Each entry is one god —
  filename (without extension) = god name. Two file types coexist:
  - **Photo god:** image file (`{name}.jpg` / `.png`) — blob loaded and shown as avatar.
  - **Emoji/name-only god:** `.txt` placeholder file (created via metadata-only `files.create`, 0 bytes)
    — `mimeType` is `text/plain` so blob loading is skipped; falls through to emoji or default.
  Filtered out of the song list in JS (`f.name !== '_Gods'`); created automatically on first write.
- **God avatar resolution order** (photo wins):
  1. `god.blobUrl` set (image/* file loaded) → `<img>`
  2. `god.properties.emoji` set (Drive file property on the god's file) → emoji character
  3. Neither → default `🛕` placeholder
  Implemented in `getGodAvatar(god)` → `{ type: 'image'|'emoji', url|value }`;
  rendered via `godAvatarHtml(god, imgClass)`.
- `fetchGodsData()` queries `id,name,mimeType,properties` in one call; only attempts blob load for
  `mimeType?.startsWith('image/')`. `cachedGods` shape: `{ name, fileId, blobUrl, properties }`.
- Tag stored as `properties.god` (Drive file property) on the song folder. Set/cleared via
  `files.update` PATCH with `{ properties: { god: name } }` or `{ god: null }` to remove.
- Song list query adds `properties` to `fields` so tags are read in the same round-trip as song names.
- God avatar URLs in `cachedGods[].blobUrl` are direct Drive API URLs (via `driveMediaUrl`), not
  ObjectURLs. `godBlobUrls` now only holds local ObjectURLs created from just-uploaded photo blobs
  (in `showAddGodForm`) — these must survive `revokeBlobs()` calls, hence the separate array.
  `cachedGods` and `godsFolderId` persist for the session.
- Filter row (horizontal scroll, FB-chat-style) above the song grid: "All" → clear filter; god avatar →
  show only that god's songs; "+" → `showAddGodForm()`. Filter state in `activeGodFilter`.
  Gods without a photo show a 🖌️ mini-button below their chip; clicking opens `showEmojiInputInline()`
  in the chip circle — saves to `properties.emoji`, updates `cachedGods` optimistically.
- Song cards show a small round god avatar badge (top-right corner) if tagged.
- Song detail view shows a god tag section (next to the title, same row): "Tag with god" button if
  untagged, or avatar + name + "Change" button if tagged. Clicking "Change" or "Tag" opens an inline
  horizontal picker. Picker includes "None" (remove tag), all gods, and "+ Add god" to create a new
  god entry. No emoji-edit affordance here — that's deliberately only on the song-list filter row's
  🖌️ mini-button (below), so the song detail's tag row stays about *which god this song is tagged
  with*, not god profile editing.
- `showEmojiInputInline(god, targetEl, onDone)`: replaces `targetEl` content with a text input;
  validates exactly 1 grapheme via `Array.from()`; on Enter/blur saves to `properties.emoji` via
  `driveUpdateProperties`, updates `cachedGods` optimistically, calls `onDone` to re-render.
- `showAddGodForm(fromSong, cachedSongs)`: wizard-shell form with Name (required), Photo (optional),
  and Emoji (optional, 60×60 square input, capped to 1 grapheme on `input` event). Save logic:
  - Photo provided → `driveUpload` with emoji in metadata `properties` if set.
  - No photo → `apiPost('files', { name: '{name}.txt', mimeType: 'text/plain', ...emojiProp })` —
    metadata-only placeholder; emoji written as Drive property at creation time.
  Appends to `cachedGods` with `properties: { emoji }` if set; if `fromSong` non-null, also tags
  that song immediately.

**Not shared with `learning-lib/`:** no selection/checking mechanic — purely playback + Drive API.

## Future restructuring

**Do this first when Math work starts:** extract `learning-lib/` from `english/`'s
game-mechanics code — `sharedRenderStrip/Tray/Blanks/Sequence`, the selector pattern
(`flattenSelectorItems`), PDF+Twemoji worksheet generation, TTS voice caching, the
praise-message pool, and the "Show Dad" replay screen. Wait until Math exists so the
extraction is based on two real consumers (English + Math), not a guess at what's
"shared" from one data point. Telugu inherits `learning-lib/` later too, assuming it
ends up using the same selector/drill format as English and Math.

Explicitly **not** shared with `learning-lib/`: the Music app. It has no
selection/checking mechanic — it's playback + Drive-versioning, a different problem
entirely.

Target shape after extraction:

```
<repo-root>/
  learning-lib/        selector/drill engine shared by english + math (+ telugu later)
  english/
  math/
  music/
  telugu/
  shared/
```

## Future scope: multi-tenant bring-your-own-Drive (Music app)

**Status:** Not started. Revisit only if the app gets real interest beyond our family.

**Goal:** Let any family run their own fully independent instance of the data layer (their own
Drive folder, their own write access) without needing us to approve their access, while still
using the same shared static app.

**Why this is needed:** Phase A (current) gives anyone read-only access to a public Drive folder
via a shared API key, but writes are gated to our OAuth app, which is in Google's "Testing"
publishing mode — capped at 100 manually-approved test users. That doesn't scale.

**What Phase B requires:**
1. Each family creates their own free Google Cloud project (~10 min) and an OAuth 2.0 Client ID
   scoped to `drive.file` (only files the app creates/touches).
2. Settings UI accepts their Drive folder ID + their own OAuth Client ID.
3. App dynamically initializes GIS OAuth using whichever Client ID is in localStorage for that
   browser — the core technical change (OAuth client init is currently hardcoded to one Client ID).
4. Folder structure stays identical — no schema change. Same `_Gods/`, song-folder, prefix
   conventions. Each family's folder is sovereign.
5. Each family's own OAuth app also starts in Testing mode (100-user cap, unverified warning) —
   fine for 1–2 users per family. Not a blocker, just a one-time click-through.

**What this explicitly avoids:** no backend, no database, no server-side auth, no billing
relationship with us. Still 100% static hosting.

**Main adoption friction:** a short non-technical "How to create your Google Cloud project and
get a Client ID" guide for parents — the code change is smaller than the docs.

**Open questions for when we revisit:**
- Does the read API key also become per-family, or stays shared? (Leaning: stays shared — harmless.)
- Should the settings UI validate the Client ID format before saving to fail fast?
- Worth a "try with our demo folder first" fallback before they set up their own Drive?

## Future scope: age/gender-based themes (Music app)

**Status:** Not started. Multiple students per folder is now built (see "Students" above) — each
student already carries a `gender`/`age`. Not yet used for anything beyond the row icon
(`genderIcon()`): no visual theming (colors, avatars, copy tone) driven by age or gender yet.

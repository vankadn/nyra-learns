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
| `student-practice.*` | Nyra's practice take — single file, versioned by Drive |

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
empty states) handles all three content types for any song. Three steps:
1. Pick content type (teacher audio, teacher notes, Nyra's practice take)
2. Pick song from existing list or create a new folder — new songs can be created directly from the app,
   no need to pre-create folders in Drive manually
3. Capture: audio types offer "Record live" (mic → live timer → stop) or "Upload a file"; teacher notes
   uses a file picker that lets the OS offer "Take Photo" or "Choose Existing" on mobile

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

**Global playback queues:** three pill buttons in the header — 🎤 Teacher, 👧 Nyra, 🔀 All — start
a queue across all songs with no shuffle. Queue order is session-only, never persisted. "All"
unshuffled = teacher clip then student clip per song, alphabetical song order. Student queue always
uses latest revision only — no revision picker in queue context. `queueGoto` is sync — sets
`audio.src = driveMediaUrl(...)` directly (no blob fetch, no ObjectURL lifecycle). Header buttons
are wired by `wireHeaderPlayButtons(songs)` after `showSongList()` loads. Entering a song view
stops the active queue.

**Auth-aware UI:** the app opens in anonymous read-only mode (`body.anon` class set at boot). All
write surfaces carry class `write-only`; CSS rule `body.anon .write-only { display:none!important }`
hides them globally — no re-render needed on sign-in. A "👤 Sign in" button (class `anon-only`)
sits top-right in the header; clicking it calls `ensureAuth()` → on success `onSignIn()` removes
`body.anon` and populates the header user pill. Hidden write surfaces: Add content buttons, empty-
state CTAs, god filter + button, god emoji mini/edit buttons, god tag Change/Tag buttons.

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
- Song detail view shows a god tag section (below title): "Tag with god" button if untagged, or avatar +
  name + optional 🖌️ emoji-edit button (shown when no photo) + "Change" button if tagged. Clicking
  "Change" or "Tag" opens an inline horizontal picker. Picker includes "None" (remove tag), all gods,
  and "+ Add god" to create a new god entry.
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

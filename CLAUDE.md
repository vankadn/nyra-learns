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
  music/               Bhajans practice player (Drive-backed, Google OAuth)
  math/                (not started — near-term)
  telugu/              (not started — no timeline)
```

## Apps

| App | Path | Status |
|---|---|---|
| English (Phonics) | `english/app/` | Live |
| Music (Bhajans) | `music/` | Built — needs config |
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

**Versioning:** Google Drive's native file revisions — not separate files. Upload a new take by
overwriting `student-practice.*` in the Drive app (same filename = new revision). The app reads
`revisions.list` and offers a date-labeled picker. Drive auto-purges revisions older than 30 days
unless marked **Keep forever** (Drive UI → version history → ⋮ → Keep forever). The app shows a
warning when the latest take is ≥25 days old and not marked keepForever.

**Auth:** Google Identity Services (GIS), client-side only. Scope: `drive` (full) + `userinfo.profile`.
No client secret, no backend. Short-lived access token; re-prompts silently if Google session is active.

Full `drive` scope (not `drive.readonly` or `drive.file`) is required because most files were created
outside the app — `drive.file` only covers files the app itself created, which would exclude all
pre-existing teacher audio/notes. The scope change triggers a new consent screen on the user's next
sign-in (tokens aren't persisted, so no migration needed).

**One-time setup after scope change:** in Google Cloud Console → Data Access, add the `drive` scope
alongside any existing scopes, then save.

**Config:** `music/config.js` holds two values, both committed with real IDs:
```js
CLIENT_ID          // OAuth Client ID (Web application type, JS origin: https://vankadn.github.io)
BHAJANS_FOLDER_ID  // Drive folder ID from the URL of the root Bhajans folder
```
Neither is a secret — OAuth Client ID is visible in any browser request; Drive folder ID is in the URL.
Both are committed directly. To test locally you must add `http://localhost:8000` as an **Authorized
JavaScript origin** on the OAuth Client ID in Google Cloud Console (takes ~5 min to propagate).

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

**Global playback queues:** three queue buttons on the song-list screen — "▶ Teacher clips", "▶ Nyra's
practice", "▶ Everything". Each has an independent 🔀 Shuffle toggle. Queue order is session-only,
never persisted. "Everything" unshuffled = teacher clip then student clip per song, alphabetical song
order; shuffled = freely mixed across all tracks. Student queue (and student half of "Everything")
always uses latest revision only — no revision picker in queue context. Audio blobs are fetched lazily
(one track at a time, on demand) and revoked on advance. Entering a song view stops the active queue.

**God tag/filter:** songs can be tagged with a god (Ganesha, Shiva, Krishna, etc.).

- `_Gods/` folder is a sibling to song folders under `BHAJANS_FOLDER_ID`. Each file in `_Gods/` is one
  god — filename (without extension) = god name, file content = avatar image. Created automatically on
  first write; filtered out of the song list in JS (`f.name !== '_Gods'`).
- Tag stored as `properties.god` (Drive file property) on the song folder. Set/cleared via
  `files.update` PATCH with `{ properties: { god: name } }` or `{ god: null }` to remove.
- Song list query adds `properties` to `fields` so tags are read in the same round-trip as song names.
- God avatar blobs tracked in a separate `godBlobUrls` array (not `activeBlobUrls`) so they survive
  `revokeBlobs()` calls during navigation. `cachedGods` and `godsFolderId` persist for the session.
- Filter row (horizontal scroll, FB-chat-style) above the song grid: "All" → clear filter; god avatar →
  show only that god's songs; "+" → `showAddGodForm()`. Filter state in `activeGodFilter`.
- Song cards show a small round god avatar badge (top-right corner) if tagged.
- Song detail view shows a god tag section (below title): "Tag with god" button if untagged, or avatar +
  name + "Change" button if tagged. Clicking opens an inline horizontal picker. Picker includes "None"
  (remove tag), all gods, and "+ Add god" to create a new god entry.
- `showAddGodForm(fromSong, cachedSongs)`: wizard-shell form (name input + photo upload). Saves image
  to `_Gods/`, appends to `cachedGods`, and if `fromSong` is non-null, also tags that song immediately.

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

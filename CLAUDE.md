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
  music/               (not started — future session)
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

**Auth:** Google Identity Services (GIS), client-side only. Scope: `drive.readonly` + `userinfo.profile`.
No client secret, no backend. Short-lived access token; re-prompts silently if Google session is active.

**Config — fill in before use:** `music/config.js` has two placeholder values:
```js
CLIENT_ID          // OAuth Client ID (Web application type, JS origin: https://vankadn.github.io)
BHAJANS_FOLDER_ID  // Drive folder ID from the URL of the root Bhajans folder
```
These are not secrets (Drive folder ID and OAuth Client ID are safe to commit), but the file is
committed with placeholder values so the real IDs stay out of the repo. Fill them in locally.

**Scope is intentionally read-only.** Uploading a new practice take = overwrite `student-practice.*`
via the Drive app. No write permission needed or wanted here.

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

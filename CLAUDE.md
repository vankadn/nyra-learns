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
| Music | `music/` | Not started |
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

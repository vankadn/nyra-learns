# English (Phonics) — Nyra Learns with Nana

## What this is

A data-driven learning toolkit for Nyra (age 5): a self-contained HTML
web app (interactive, no build step) plus a PDF worksheet generator. Currently
covers English vowels (short, long, vowel teams, OU/OW), consonant digraphs (sh, ch, th, ph), and consonant blends (pl, br, cl, cr, fl). Designed to extend to
other subjects (e.g. Telugu, Maths) by adding new data files — not new code.

## Why this structure

Everything is static JSON checked into the repo. The app and the PDF worksheet
both render from the same JSON file — updating one data file updates both outputs.

Core engine code (quiz logic, rendering, PDF layout) must stay subject-agnostic.
Subject-specific content lives only in `app/data/*.json`. If you find yourself
hardcoding a word or category name into a JS module or `generate.py`, stop — it
belongs in JSON.

## Project layout

```
app/index.html         Thin shell — no logic. All JS is in app/js/.
app/css/styles.css     All styles.
app/js/                ES module tree (see below).
app/data/*.json        One file per subject/unit.
worksheets/generate.py PDF generator (reportlab). Reads the same JSON files.
```

## Module architecture

```
app/js/
  main.js
  nav.js
  learn.js
  quiz.js
  selector.js          buildSelectorHTML, getSelectorWords, getSelectorSentences
  emoji.js             getEmoji(), DEFAULT_EMOJI
  utils.js             shuffle(), pickBlankPositions()
  audio/
    tts.js             speak(), pickVoice(), cachedVoice
    tones.js           playChime()
  game-engine/
    tile-tray.js       sharedRenderStrip, sharedRenderTray, sharedWireBlanks, sharedTryPlace
    sequence.js        sharedRenderSequence, sharedWireSequence, sharedCheckSequence
    game-shell.js      celebrate(), renderGameSection(), showReplay()
  games/
    letter-builder.js  Game 1 (g1) — spell word from full letter tray + decoys
    word-match.js      Game 2 (g2) — match word to emoji, two columns
    missing-letter.js  Game 3 (g3) — fill blanks only (1/2/3 by level)
    unscramble.js      Game 4 (g4) — reorder word's own letters, no decoys
    sentence-builder.js Game 5 (g5) — reorder sentence words
  pdf/
    pdf-utils.js       emojiCache, loadEmojiImage(), hexToRgb()
    worksheet-pdf.js   renderWorksheetSection, generateWorksheetPDF
    game-pdf.js        generateSpellItPDF, generateMatchPDF, generateMissingLetterPDF,
                        generateUnscramblePDF, generateSentenceBuilderPDF
```

**Key rules:**
- `game-shell.js` owns `celebrate()`, `renderGameSection()`, `showReplay()` — don't duplicate.
- All TTS through `speak()` only — never construct `SpeechSynthesisUtterance` elsewhere.
- jsPDF loaded as CDN UMD `<script>` — accessed via `window.jspdf` inside modules.
- All games live inside the Games picker grid (not top-level tabs).
- Sound effects via Web Audio API only — no external audio files.

## Data file schema (app/data/*.json)

```json
{
  "metadata": { "subject": "string", "unit": "string", "version": "string" },
  "completionPraises": ["string"],
  "stickerThemes": [
    { "id": "kebab", "label": "string", "emoji": ["🦄","🌈","✨","💖"] }
  ],
  "sections": [
    {
      "id": "kebab-case-id",
      "title": "string",
      "color": "#hex",
      "icon": "🔤",
      "defaultEmoji": "🔤",
      "tip": "optional — shown above section in Learn tab",
      "rule": "optional — phonics rule shown in Learn tab",
      "vowels": [
        { "letter": "A", "example": "cat", "speak": "a as in cat" }
      ],
      "transforms": [
        { "from": "a", "to": "a-e", "example": "mat → mate" }
      ],
      "items": [
        {
          "id": "kebab-case-id",
          "label": "string",
          "defaultEmoji": "🐾",
          "note": "optional — tip shown in UI for exceptions/rules",
          "rule": "optional — used in spelling-rules section items",
          "teacherNotes": {
            "howToSay": "mouth position and sound",
            "simpleRule": "phonics rule in one sentence",
            "indianDadTip": "Hindi/Telugu comparison, traps for Indian speakers",
            "commonMistake": "what to watch out for",
            "exampleSentence": "fun sentence using words from this item"
          },
          "words": [
            { "word": "cat",    "emoji": "🐱", "level": "easy"   },
            { "word": "clap",   "emoji": "👏", "level": "medium" },
            { "word": "strand", "emoji": "🏖️", "level": "hard"   }
          ],
          "sentences": [
            { "words": ["The", "cat", "sat"], "level": "easy" },
            { "words": ["The", "fat", "cat", "had", "a", "hat"], "level": "medium" },
            { "words": ["Sam", "ran", "past", "the", "black", "flag"], "level": "hard" }
          ]
        }
      ]
    }
  ]
}
```

**Level definitions:**
- `easy` — CVC, common, concrete, high-frequency (cat, bed, sit)
- `medium` — blends, digraphs, less common but familiar (clap, truck, frost)
- `hard` — longer, less frequent, exceptions, multi-consonant clusters (strand, bright)

**Sentences rules:**
- Optional per item — items with no `sentences` are silently skipped in Sentence Builder.
- `easy` = 3 words, `medium` = 4–5, `hard` = 6+ or trickier word order.
- Aim for 2–4 sentences per level. Sight words as glue are fine.
- Words don't need to be from `item.words` — just thematically appropriate.
- Content generated in claude.ai project chat, not Claude Code.

**Emoji fallback chain (implement everywhere):**
1. `word.emoji` → 2. `item.defaultEmoji` → 3. `section.defaultEmoji` → 4. `DEFAULT_EMOJI = "📖"`

Never render a broken/empty emoji slot — always fall through.

**Emoji rules:** Every word must have an `"emoji"` field. Emoji assigned in claude.ai project chat — do not add or change emoji in Claude Code.

## Data inventory — vowels.json sections

| Section id | Items |
|---|---|
| `short-vowels` | `short-a` `short-e` `short-i` `short-o` `short-u` |
| `long-vowels` | `long-a` `long-e` `long-i` `long-o` `long-u` |
| `vowel-teams` | `ai-ay` `ee-ea` `oa-ow` `oo` `ui-ue` `oi-oy` `ou-ow` `ei-eigh` |
| `spelling-rules` | `use-ck` `use-k` `use-c` |
| `consonant-digraphs` | `sh` `ch` `th` `ph` |
| `consonant-blends` | `pl` `br` `cl` `cr` `fl` |
| `g-variations` | `hard-g` `soft-g` |

Word counts: 30 words per item (20 for `ei-eigh`, 24 for digraphs sh/ch/th, 14 for `ph`, 18 for blends, 42 for `hard-g`, 25 for `soft-g`).

Top-level arrays: `completionPraises` (16 strings), `stickerThemes` (6 themes).

## Workflow split

Homework notes, curriculum questions, emoji assignments, and JSON data blocks are handled in the **claude.ai project chat** — that chat holds curriculum memory and produces ready-to-paste JSON. This repo (Claude Code) is for wiring JSON into the app/worksheet. Do not decide content or emoji here.

## Commands

```bash
# Run the app locally (from repo root)
python3 -m http.server 8000      # open http://localhost:8000/english/app/
# Must be http — file:// is blocked by Chrome CORS for ES modules.

# Generate a worksheet PDF (from english/ directory)
cd english/worksheets && python3 generate.py --data ../app/data/vowels.json --output output/

# Preview PDF as images
python3 -c "from pdf2image import convert_from_path; [im.save(f'p{i}.png') for i,im in enumerate(convert_from_path('FILE.pdf', dpi=100))]"
```

## Conventions

- Worksheets default to 25 words per section.
- Python PDF uses Noto Color Emoji font (`assets/NotoColorEmoji.ttf`) — do not use reportlab default fonts for emoji.
- In-app PDF uses Twemoji PNG CDN (`cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/`).
- Deploy target: Netlify Drop or GitHub Pages — no server, no build step.
- `worksheets/generate.py` (reportlab) cannot be called from the deployed site — PDF is generated client-side via jsPDF.

## Migration history

**2026-06-25 — moved into `/english/` subfolder** as part of converting the repo to a
multi-app monorepo. Previous location: `app/` at repo root. All paths inside the app
were already relative, so no internal path changes were needed. The root `index.html`
landing page now lives at repo root; the app is served from `english/app/`.

Pre-migration the `worksheets/` directory was at repo root; it is now at `english/worksheets/`.
The legacy monolithic `Nyra_Learns_with_Nana.html` (pre-module, 948 lines) was moved to
`english/Nyra_Learns_with_Nana.html` for archive purposes.

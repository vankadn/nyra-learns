# Nyra Learns with Nana — Multi-Subject Learning App

## What this is

A data-driven learning toolkit for Nyra (age 5): a self-contained HTML
web app (interactive, no build step) plus a PDF worksheet generator. Currently
covers English vowels (short, long, vowel teams, OU/OW), consonant digraphs (sh, ch, th, ph), and consonant blends (pl, br, cl, cr, fl). Designed to extend to
other subjects (e.g. Telugu, Maths) by adding new data files — not new code.

## Why this structure

The parent curates word lists by hand from the child's real classroom
homework (photographed, then typed up together with Claude in chat). There is
no word-discovery automation and no database — everything is static JSON,
checked into the repo. The app and the PDF worksheet both render from the
same JSON file, so updating one data file updates both outputs.

Core engine code (quiz logic, rendering, PDF layout) must stay
subject-agnostic. Subject-specific content (word lists, categories, sounds)
lives only in `app/data/*.json`. If you find yourself hardcoding a word or a
category name into a JS module or `generate.py`, stop — it belongs in JSON.

## Project layout

```
app/index.html         Thin shell: <head> + header + tab bar + content div +
                        one <script type="module" src="js/main.js">.
                        No logic lives here — all JS is in app/js/.
app/css/styles.css     All styles. No inline <style> in index.html.
app/js/                ES module tree (see Module architecture below).
app/data/*.json        One file per subject/unit. See schema below.
worksheets/generate.py PDF generator (reportlab). Reads the same JSON files.
                        25 words per section, compact layout — no separate
                        blank-line table, write-line lives inside each word
                        cell. Use KeepTogether so a section header never gets
                        orphaned from its table across a page break.
```

## Module architecture ✅ DONE

The app was refactored from a 2,600-line monolithic `index.html` into ES
modules. No behavior changed — same UI, games, PDF output. No build step;
browsers run ES modules natively over http (not file://).

```
app/js/
  main.js                 Entry point: fetches JSON, builds tab bar, mounts all sections
  nav.js                  showTab, showLearnTab, showGames, showGame, showLearn,
                           initNav, renderGamesSection
  learn.js                renderVowelSection, renderTeamsSection (Learn tabs)
  quiz.js                 buildQuizData, renderQuizSection + all quiz state/logic
  selector.js             buildSelectorHTML, setupSelector, getSelectorWords
                           (shared by Worksheet + all games)
  emoji.js                getEmoji(), DEFAULT_EMOJI (emoji fallback chain)
  utils.js                shuffle(), pickBlankPositions()
  audio/
    tts.js                speak(), pickVoice(), cachedVoice
    tones.js              playChime()
  game-engine/
    tile-tray.js          sharedRenderStrip, sharedRenderTray, sharedWireBlanks,
                           sharedTryPlace  (used by Letter Builder + Missing Letter)
    game-shell.js         celebrate(), renderGameSection() factory
                           — eliminates 3x-duplicated setup screen + celebrate code
  games/
    letter-builder.js     Game 1
    word-match.js         Game 2
    missing-letter.js     Game 3
  pdf/
    pdf-utils.js          emojiCache, loadEmojiImage(), hexToRgb() (shared by all PDFs)
    worksheet-pdf.js      renderWorksheetSection, generateWorksheetPDF
    game-pdf.js           generateSpellItPDF, generateMatchPDF, generateMissingLetterPDF
```

**Key design decisions:**
- `game-shell.js` owns `celebrate()` and `renderGameSection()` — the 3 games
  were byte-for-byte duplicating both. Adding a new game: call `renderGameSection()`
  and `celebrate()` with per-game strings; don't copy boilerplate.
- `pickBlankPositions` lives in `utils.js` (pure function) so `pdf/game-pdf.js`
  can import it without pulling in audio/DOM code from tile-tray.
- `pdf/pdf-utils.js` holds `emojiCache` as a module singleton — both PDF modules
  import from it and share the same cache instance automatically.
- jsPDF loaded as a CDN UMD `<script>` (not an ES module) — accessed via
  `window.jspdf` inside modules. No importmap needed.
- Each game module stores `_sections` as a module-level variable set on first
  render, so Play Again callbacks can call `getSelectorWords(_sections, ...)`
  without needing a global `DATA` reference.

## Data file schema (app/data/*.json)

```json
{
  "metadata": { "subject": "string", "unit": "string", "version": "string" },
  "sections": [
    {
      "id": "kebab-case-id",
      "title": "string",
      "color": "#hex",
      "icon": "🔤",
      "defaultEmoji": "🔤",
      "tip": "optional — shown above the section in the Learn tab",
      "rule": "optional — phonics rule shown in the Learn tab",
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
          "note": "optional — shown as a tip in the UI for exceptions/rules",
          "rule": "optional — used in spelling-rules section items",
          "teacherNotes": {
            "howToSay": "Plain English description of mouth position and sound",
            "simpleRule": "The actual phonics rule in one sentence",
            "indianDadTip": "Comparison to Hindi/Telugu sounds, common traps for Indian speakers",
            "commonMistake": "What to watch out for",
            "exampleSentence": "A fun sentence using words from this item"
          },
          "words": [
            { "word": "cat",    "emoji": "🐱", "level": "easy"   },
            { "word": "clap",   "emoji": "👏", "level": "medium" },
            { "word": "strand", "emoji": "🏖️", "level": "hard"   }
          ],
          "sentences": [
            { "words": ["The", "cat", "sat"], "level": "easy"   },
            { "words": ["The", "fat", "cat", "had", "a", "hat"], "level": "medium" },
            { "words": ["Sam", "ran", "past", "the", "black", "flag"], "level": "hard" }
          ]
        }
      ]
    }
  ]
}
```

**`sentences` field rules (Sentence Builder game):**
- Optional per item — items with no `sentences` are silently skipped in the Sentence Builder selector.
- Level maps to sentence complexity: `easy` = 3 words, `medium` = 4–5 words, `hard` = 6+ words or trickier word order.
- Aim for 2–4 sentences per level per item. Sight words ("The", "a", "is", "has", "can") are fine as glue.
- Words in the sentence do **not** need to be from `item.words` — they just need to be thematically appropriate.
- Generated in the claude.ai project chat, not in Claude Code.

**Level definitions:**
- `easy` — CVC, common, concrete, high-frequency words (cat, bed, sit)
- `medium` — blends, digraphs, less common but familiar (clap, truck, frost)
- `hard` — longer, less frequent, exceptions, multi-consonant clusters (strand, bright, pluck)

**How levels are used (implement in app and PDF generator):**
- Learn tab — shows `easy` words by default; "Show More" reveals `medium`
- Quiz — filter by selected level(s); defaults to `easy`
- PDF worksheet — user picks which level(s) to include before generating
- Randomization — always random within the selected level(s)
- No separate displayWords field needed — `level` is the only filter

**Emoji rules:**
- Every word entry must have an `"emoji"` field — closest-match emoji.
- Emoji are generated by the claude.ai project chat when producing JSON data
  blocks. Do not add or change emoji in Claude Code — that's content work.
- In-app PDF uses Twemoji PNG CDN (`cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/`)
  for color emoji. Noto Color Emoji TTF is 24MB — not practical in a browser.
- App uses emoji for the word-flip interaction (double-tap chip to flip).

**Emoji fallback chain (handle defensively in all rendering code):**
1. Word-level: `word.emoji` — use if present and non-empty
2. Item-level: `item.defaultEmoji` — fallback for that sub-category
3. Section-level: `section.defaultEmoji` — fallback for that section
4. App-level global constant: `DEFAULT_EMOJI = "📖"` — last resort, always defined

Both the app and the PDF generator must implement this full chain.
Never render a broken/empty emoji slot — always fall through to the next level.

Adding a new subject = adding a new JSON file matching this schema. Do not
change any JS module or `generate.py` to add subject-specific logic.

## Data inventory — vowels.json

**Top-level arrays** (not inside `sections`):
- `completionPraises` — 16 strings, read by `showReplay()` in `game-shell.js`
- `stickerThemes` — 6 themes (unicorn, princess, underwater, space, garden, rainbow),
  read by `renderWorksheetSection()` for the PDF theme picker

All items have 30 words (20 for `ei-eigh`). Sentences listed below are what
currently exists; items with `— none` still need sentences generated in the
claude.ai project chat.

**Short Vowels** (`short-vowels`)
| Item | Label | Sentences |
|---|---|---|
| `short-a` | Short A — /a/ | "The cat sat" [easy], "A bat can tap" [easy], "The fat cat had a hat" [medium], "Sam ran past the black flag" [hard] |
| `short-e` | Short E — /e/ | "The red hen sat" [easy], "Peg has a red pen" [medium] |
| `short-i` | Short I — /i/ | — none |
| `short-o` | Short O — /o/ | — none |
| `short-u` | Short U — /u/ | — none |

**Long Vowels** (`long-vowels`)
| Item | Label | Sentences |
|---|---|---|
| `long-a` | Long A | — none |
| `long-e` | Long E | — none |
| `long-i` | Long I | — none |
| `long-o` | Long O | — none |
| `long-u` | Long U | — none |

**Vowel Teams** (`vowel-teams`)
| Item | Label | Sentences |
|---|---|---|
| `ai-ay` | ai / ay — Long A | — none |
| `ee-ea` | ee / ea — Long E | — none |
| `oa-ow` | oa / ow — Long O | — none |
| `oo` | oo — moon or book | — none |
| `ui-ue` | ui / ue — Long U | — none |
| `oi-oy` | oi / oy | — none |
| `ou-ow` | ou / ow — ouch sound | — none |
| `ei-eigh` | ei / eigh — Long A | — none |

**C, K, and CK Spelling Rules** (`spelling-rules`)
| Item | Label | Sentences |
|---|---|---|
| `use-ck` | CK — after a short vowel | — none |
| `use-k` | K — after consonant, vowel team, or long vowel | — none |
| `use-c` | C — before a, o, u or start of most words | — none |

**Consonant Digraphs** (`consonant-digraphs`) — sh/ch/th 24 words each; ph 14 words (Greek-origin words rarer at this level, same reasoning as ei-eigh having 20)
| Item | Label | Sentences |
|---|---|---|
| `sh` | Sh — /sh/ | — none |
| `ch` | Ch — /ch/ | — none |
| `th` | Th — /th/ | — none |
| `ph` | Ph — /f/ | — none |

**Consonant Blends** (`consonant-blends`) — 18 words each (smaller usable kindergarten-level vocabulary for l/r blends)
| Item | Label | Sentences |
|---|---|---|
| `pl` | Pl — /pl/ | — none |
| `br` | Br — /br/ | — none |
| `cl` | Cl — /cl/ | — none |
| `cr` | Cr — /cr/ | — none |
| `fl` | Fl — /fl/ | — none |

## Workflow split (where to ask what)

New homework notes/photos and curriculum questions ("which section does this
word belong in", "why is this word an exception") go in the claude.ai project
chat, not here — that chat holds the curriculum memory, emoji assignments, and
conventions, and produces ready-to-paste JSON data blocks. This repo (and
Claude Code) is for wiring that JSON into the app/worksheet and running
things, not for deciding what content or emoji go in.

## Commands

```bash
# Run the app locally
python3 -m http.server 8000      # then open http://localhost:8000/app/
# NOTE: must be served over http — opening index.html via file:// is blocked
# by Chrome's CORS policy (ES modules + file:// = blocked). VS Code's browser
# preview serves over localhost automatically, so it works there.

# Generate a worksheet PDF from a data file
cd worksheets && python3 generate.py --data ../app/data/vowels.json --output output/

# Preview a generated PDF as images (sanity-check layout before sharing)
python3 -c "from pdf2image import convert_from_path; [im.save(f'p{i}.png') for i,im in enumerate(convert_from_path('FILE.pdf', dpi=100))]"
```

## Conventions

- Worksheets default to 25 words per section unless told otherwise.
- PDF uses Noto Color Emoji font (bundled in repo at `assets/NotoColorEmoji.ttf`)
  so emoji render in full color in print. Do not use reportlab's default fonts
  for emoji — they will render as boxes.
- Deploy target is Netlify Drop or GitHub Pages — no server, no build step.

## Feature spec: in-app customizable PDF worksheet generator ✅ BUILT

**Why:** Parent should never need to ask Claude to manually build a worksheet.
A "Worksheet" tab inside `index.html` lets them pick content and download a
PDF directly, self-serve.

**Important constraint:** GitHub Pages / Netlify Drop serve static files only
— no Python runtime. `worksheets/generate.py` (reportlab) CANNOT be called
from the deployed site. This feature must generate the PDF client-side in
JavaScript, using a browser PDF library (e.g. jsPDF via CDN). Treat this as a
parallel implementation of the same layout rules `generate.py` already
follows, not a way to invoke the Python script.

**UI requirements:**
- New tab, "Worksheet" (alongside Short/Long/Vowel Teams/Quiz).
- Category checkboxes matching the JSON `sections` (Short Vowels, Long Vowels,
  Vowel Teams, OU/OW, etc.), each expandable to reveal its `items` (e.g. under
  Vowel Teams: ai/ay, ee/ea, oi/oy...) as sub-checkboxes. Checking a category
  checks all its items; unchecking an item doesn't have to uncheck the parent
  visually — use a tri-state/indeterminate look if convenient, but don't over-
  engineer this for v1.
- A word-count control (number input or slider) per generation — applies as
  "how many words to pull from each selected category," not a global total.
  If a category has fewer words available than requested, use all of them
  (don't error, don't repeat words).
- "Generate PDF" button → builds and downloads the PDF immediately, named
  `Nyra-Worksheet-<date>.pdf`.

**PDF output requirements:**
- One section per selected category, compact grid layout, no wasted space.
- Each word cell: emoji above the word (color, using Noto Color Emoji),
  word in bold below, write-line beneath the word.
- Column count: 4-5 based on page width.
- Keep section header + its word grid together (no orphaned headers).

**App word-flip interaction:**
- Word chips show the word text normally on first view.
- Double-tap/click flips the chip to show the emoji large and bright.
- Tap again to flip back to the word.
- This is a reward/confirmation mechanic for Nyra after reading each word.

**Out of scope for v1:** server-side generation, saving past worksheets,
mixing word counts per individual item within a category (count is per
category only).

## Feature spec: teacher notes (tap to reveal + optional PDF inclusion) ✅ BUILT

**Why:** The parent (non-native English speaker) needs reference notes while
sitting with Nyra. Notes must not clutter Nyra's view but be one tap away.

**teacherNotes fields in JSON (all optional, render what exists):**
- `howToSay` — mouth position and sound description
- `simpleRule` — the phonics rule in one sentence
- `indianDadTip` — Hindi/Telugu comparison, traps for Indian speakers
- `commonMistake` — what to watch out for
- `exampleSentence` — fun sentence using words from this item

**App UI:**
- Each item in the Learn tab has a small "Notes" button (e.g. 📋)
- Tapping reveals/hides a notes panel below that item
- Notes panel shows all available fields in a clean card layout
- Default state: hidden. No clutter for Nyra.
- The short `tip` and `rule` at section level stay always visible (unchanged).

**PDF worksheet:**
- "Include teaching notes" checkbox in the Worksheet tab (default: unchecked)
- When checked: each section gets a small boxed notes panel at the top
  showing `simpleRule` + `indianDadTip` + `commonMistake` only
- `howToSay` and `exampleSentence` omitted from PDF (space constraint)
- Notes box: light background, smaller font, dashed border — visually distinct

**Data responsibility:** teacherNotes content is generated in the claude.ai
project chat. Do not write or edit teacherNotes in Claude Code.

## Feature spec: Game 1 — Letter Tile Builder (spelling game) ✅ BUILT

**Concept:** Build words letter-by-letter by dragging tiles into blanks,
using an emoji as the clue.

**Setup screen:** reuse the existing category/item/level/word-count selector
component from the Worksheet tab (extract into a shared component if not
already shared). Add a "Start Game" button.

**Gameplay:**
- Show the selected emoji set as a progress strip at the top (all words in
  the round, always visible).
- Only ONE word is "active" at a time — its emoji is highlighted/enlarged,
  with empty letter blanks underneath matching that word's length.
- A single shared letter tray below contains ALL letters from ALL words in
  the round, shuffled together — decoy letters from other words are
  intentional, she has to pick the right ones for the active word.
- Drag a letter tile from the tray into a blank slot:
  - Correct letter, correct slot -> tile snaps in, stays.
  - Wrong letter -> tile snaps in, turns red, shakes, then bounces back to
    the tray (does not stay in the wrong slot).
- When a word is fully and correctly filled:
  - Play a short upbeat chime via Web Audio API (oscillator-generated tone —
    do not fetch external audio files, app stays dependency-free).
  - That emoji gets a checkmark badge, becomes visually "done" (dimmed or
    green ring), stays visible in the strip, no longer interactive.
  - Auto-advance to the next incomplete emoji.
- After the last word: celebration animation (confetti-style CSS, reuse
  existing visual language) + "Play Again" button back to setup screen.

**Letter tray mechanics:**
- Letters shuffled (not grouped by word).
- Placed letters are removed from the tray.
- Support BOTH drag-and-drop (primary) AND tap-to-select-then-tap-target
  (secondary) as input methods — trackpad drag can be finicky for a
  5-year-old. Both always available simultaneously, no mode switch.

## Feature spec: Game 2 — Match Word to Emoji (reading/recognition game) ✅ BUILT

**Concept:** Connect each written word to its matching emoji. Supports both
in-app play and a printable worksheet — PDF export is required, not optional,
for this game.

**Setup screen:** same shared selector component as Game 1. Provide both a
"Start Game" button (in-app) and a "Generate PDF" button from the same screen.

**App gameplay:**
- Two columns: words (text only) on the left, emoji on the right, right
  column shuffled so matches aren't aligned by row.
- Primary interaction: drag from word to emoji (or emoji to word) to draw a
  connecting line.
- Secondary interaction: tap a word, then tap an emoji to connect — a full
  alternative to drag, not just an error fallback.
- Correct match: line locks green, checkmark, soft positive sound (reuse
  Game 1's chime).
- Incorrect match: line flashes red, disappears, both items return to
  unmatched state, retry immediately.
- All pairs matched -> same celebration state as Game 1.

**PDF mode:**
- Reuse the existing client-side jsPDF setup from the Worksheet tab.
- Two columns on the page: words down the left, emoji (via the existing
  Twemoji image approach) down the right in a different shuffled order than
  the left.
- Leave clear space between columns for a hand-drawn pencil line.
- Instruction line at top: "Draw a line to match each word to its picture!"
- Filename pattern: `Nyra-Match-<date>.pdf`, consistent with
  `Nyra-Worksheet-<date>.pdf`.

## Shared requirements for all games

- All games live inside the **Games picker grid** (not top-level tabs).
- Reuse `buildSelectorHTML` / `getSelectorWords` — do not duplicate the selector.
- Use the existing emoji fallback chain — never show a broken/empty emoji.
- No new `vowels.json` fields needed — all games work from `word`, `emoji`, `level`.
- No hardcoded words in game code — stay fully data-driven.
- Sound effects via Web Audio API only (generated tones) — no external audio files.
- All TTS goes through the single shared `speak()` — never construct a separate
  `SpeechSynthesisUtterance` elsewhere or it bypasses the voice fix.

## Fix: TTS voice selection ✅ DONE

`speak()` uses `cachedVoice` (set by `pickVoice()`) with preferred chain:
`['Samantha', 'Google US English', 'Karen', 'Moira', 'Ava']` → any `en-US` →
first available. Cached at page load; re-cached on `onvoiceschanged` (voices
load async). On the parent's Mac this locks onto **Samantha** — clear, friendly
US English. Single `speak()` covers all call sites: word chips, quiz, progress
strip taps, active clue emoji, Word Match emoji column.

## Fix: navigation restructure — Games launcher grid ✅ DONE

Top bar has exactly six items: Short Vowels, Long Vowels, Vowel Teams,
C/K/CK Spelling Rules, Worksheet, **Games**. Clicking Games replaces the tab
area with a picker grid — one card per game (icon + name + description). Each
card opens its setup screen. Every game has a "Back to Games" button; the grid
has "Back to Learn". Adding a future game = adding a card, never touching the
top bar. Navigation functions: `showGames()`, `showGame(id)`, `showLearn(id)`.

## Feature spec: Game 3 — Missing Letter (fill-in-the-blank spelling game) ✅ BUILT

**Concept:** Same underlying mechanic as Letter Builder, but words start
mostly filled in with only some letters blanked out — a lighter-weight
spelling/recognition step between Letter Builder (full spelling) and reading.

**Setup screen:** same shared selector component as Letter Builder and
Match Word to Emoji (category/item/level/word-count). Add a "Start Game"
button. This game goes into the Games picker grid as its own card, not a
new top-level tab (per the navigation restructure already specced above).

**Blank count scales with level:**
- `easy` words: 1 letter blanked out
- `medium` words: 2 letters blanked out
- `hard` words: 3 letters blanked out
- Blanked letter positions within the word are randomized each round (not
  always the same position, e.g. not always the middle letter).

**Gameplay (mirrors Letter Builder's structure):**
- Progress strip of all words/emoji in the round at the top, one "active"
  word at a time, same highlight/enlarge treatment as Letter Builder.
- Active word displayed with most letters already shown, blanks only where
  letters are missing (e.g. easy word "cat" with 1 blank might show `c a _`
  or `_ a t` — varies by random position).
- A single shared letter tray below, containing the letters needed to fill
  ALL blanks across ALL words in the round, shuffled together with decoys
  from other words' blanks — same mechanic as Letter Builder's tray, just
  with fewer total tiles needed per word since most letters are pre-filled.
- Same input methods: drag-and-drop (primary) and tap-to-select-then-tap-
  target (secondary), both always available.
- Same correctness feedback as Letter Builder: correct letter snaps into
  its blank and stays; wrong letter snaps in, turns red, shakes, bounces
  back to the tray.
- Same completion feedback per word: chime (reuse Letter Builder's Web
  Audio API tone), checkmark badge on that word's emoji in the progress
  strip, word marked done/non-interactive, auto-advance to next active word.
- Same end-of-round celebration + "Play Again" as Letter Builder.

**Implementation note:** this game shares almost all mechanics with Letter
Builder (progress strip, shared tray, drag/tap input, success/error
feedback, celebration). Strongly prefer extracting the shared tile-tray
interaction logic into reusable functions/components rather than
duplicating Letter Builder's code wholesale — the only real differences are
(a) how many letters are pre-filled vs blanked, and (b) blank count derived
from level.

**Data:** no new vowels.json fields needed — uses word, emoji, and level
exactly as they already exist. Blank positions are computed at game-start
time in JS, not stored in data.

## Implementation note: shared tile-tray mechanics ✅ DONE

`sharedRenderStrip`, `sharedRenderTray`, `sharedWireBlanks`, `sharedTryPlace`,
and `pickBlankPositions` were extracted from Game 1 and are now the single
implementation used by both Letter Builder and Missing Letter. Game 1 was
refactored to call these helpers; behavior is unchanged. Any future tile-tray
game should call these shared functions rather than reimplementing them.

## Fix: Play Again draws fresh words ✅ DONE

Play Again in all games (Letter Builder, Word Match, Missing Letter) calls
`getSelectorWords(DATA.sections, secEl, prefix)` fresh — it re-reads the
hidden-but-intact selector DOM to return a new random sample from the same
category/level/count settings the user chose, not a reshuffle of the previous
word list. `getSelectorWords` also returns `level` on each word object (needed
by Missing Letter for blank-count calculation).

## Fix: emoji tap-to-replay TTS ✅ DONE

Tapping any emoji in the three tile games replays TTS for that word:
- **Progress strip chips** (Letter Builder + Missing Letter): `data-word`
  attribute + click listener added in `sharedRenderStrip` — covers all chips
  including done ones.
- **Active clue emoji** (`#g1-emoji`, `#g3-emoji`): `onclick` set in each
  game's `refreshActive` call — replays the current word.
- **Word Match emoji column**: unmatched emoji taps speak via `g2HandleTap`;
  matched (green) emoji speak via the `pointerdown` handler before early return.
Both `.g1-progress-chip` and `.g1-emoji-large` have `cursor: pointer` so the
tappable affordance is visually obvious.

## Fix: Word Match PDF dot placement ✅ DONE

Left connection dot is now placed 4mm after the word text using
`doc.getTextWidth()` rather than at a fixed 68mm column edge. Eliminates
the large dead gap between short words and their dot.

## Feature: PDF export for all games ✅ BUILT

Every game now has a "📄 Get PDF" button on its setup screen and a "🖨️ PDF"
icon in the top-right of the play area (active during a round, disappears on
the celebration card).

| Game | PDF filename | Content |
|---|---|---|
| Letter Builder | `Nyra-SpellIt-<date>.pdf` | Emoji + empty letter boxes (one per letter) + scrambled tiles |
| Word Match | `Nyra-Match-<date>.pdf` | Two-column match sheet (unchanged) |
| Missing Letter | `Nyra-MissingLetter-<date>.pdf` | Emoji + grey pre-filled boxes + empty blank boxes + missing-letter tiles |

**Per-row scrambled letter tiles (design decision):**
Rather than a shared letter pool on the right half of the page, each word row
gets its own scrambled tiles immediately to the right of its boxes. This keeps
the visual connection between word and letters obvious for a 5-year-old — no
scanning the whole page to find which letters belong to which word.

- **SpellIt tiles**: all letters of the word shuffled (yellow rounded tiles)
- **MissingLetter tiles**: only the blanked letter(s) for that word — 1 tile
  for easy, 2 for medium, 3 for hard (same `pickBlankPositions` used by the
  game engine)
- Tiles wrap to a second row automatically for long words; row height expands
  dynamically so nothing overlaps
- Tile style: light yellow background (`#FFF9C4`), purple border — visually
  distinct from the white answer boxes

## Feature spec: Game 4 — Unscramble ✅ BUILT

**Concept:** Classic word scramble — only the active word's own letters, shuffled
into a tile row; drag/tap them into order to spell the word. Emoji is the clue.
No decoy letters from other words — that's Letter Builder's job.

**Setup screen:** same shared selector (category/item/level/word-count) as the
other games. "Start Game" button + "📄 Get PDF" button.

**Progress strip:** `sharedRenderStrip` — all emoji visible at top, one active at
a time (same pattern as Letter Builder/Missing Letter). `g4` prefix for state vars.

**Gameplay:**
- Active word's letters shuffled into a tile row above a row of empty ordered slots.
- All tiles are the word's own letters — no decoys at any level. Level controls
  which words appear (longer/harder at `hard`), not tile set composition.
- Input: drag-and-drop (primary) + tap-tile-then-tap-slot (secondary), both always
  active simultaneously — consistent with every other game.
- Correctness checked **per placement** (not on submit): tile in the right slot
  snaps and stays; tile in the wrong slot bounces back to the tile row immediately.
  Consistent with Letter Builder's instant feedback pattern.
- Completion per word: chime + checkmark badge on progress strip + auto-advance.
- End of round: same celebration + "Play Again" as the other games.

**Shared code (new extraction):**
These two functions support pure-reorder mechanics (distinct from identity-matching
in sharedRenderTray/sharedWireBlanks):
```
sharedRenderSequence(items, opts)  // items = array of strings (letters or words)
                                    // renders: shuffled tile row + empty ordered slots
sharedWireSequence(...)            // drag + tap-tap input, both always on
sharedCheckSequence(...)           // per-placement correctness, wrong slot bounces back
```
Unscramble is the first consumer. Sentence Builder reuses the same functions — build
the abstraction correctly here rather than patching it when Game 5 arrives.

**Data:** no new JSON fields. `getSelectorWords` as-is. `word`, `emoji`, `level` only.

**PDF (`Nyra-Unscramble-<date>.pdf`):**
Same per-row-tiles pattern as SpellIt: emoji + empty ordered boxes + that word's
own letters scrambled in tiles to the right. Visually nearly identical to SpellIt
PDF — that's fine, the paper format doesn't need decoys either way.

**Games picker grid:** new card, `g4` id. No top-bar changes.

**Instant-bounce confirmed:** tile in wrong slot bounces back immediately, same as
Letter Builder. Every tile is a correct letter — wrong position is still wrong.

**Tile layout:** tile row at the bottom, ordered slots above — matches Letter Builder's
spatial layout (active clue + answer area on top, tiles below).

**TTS on word completion:** speak the word aloud when each word is correctly completed.
This applies to ALL tile games (Letter Builder, Missing Letter, Unscramble) — fix
existing games at the same time as implementing Game 4.

**Implementation:** `app/js/games/unscramble.js` (`g4` prefix). `buildSeqState` is called
fresh on each new active word (not once at game start) — the tray only ever holds the
current word's letters. `generateUnscramblePDF` is a thin wrapper around `generateSpellItPDF`
with `{ title, filename }` opts — no code duplication. `sharedRenderStrip` reused for
the progress strip unchanged.

## Feature spec: Game 5 — Sentence Builder ✅ BUILT

**Concept:** Word-level reorder game — a short sentence's words shuffled into
draggable chips, placed into ordered slots to rebuild the sentence. Emoji not the
clue here — reading comprehension and word order are the challenge.

**Setup screen:** same shared selector pattern, filtering by category/item as usual.
Level maps to sentence complexity (easy = 3 words, medium = 4–5, hard = 6+ or
question-form sentences). "Start Game" + "📄 Get PDF" buttons.

**Progress indicator:** **not** `sharedRenderStrip` — sentences are too wide for a
multi-item emoji strip. Use a plain counter instead: "Sentence 2 of 5" + a small
✅/⬜ dot per sentence below it. Do not try to fit `sharedRenderStrip` here.
One-active-at-a-time confirmed — showing all sentences stacked is out of scope.

**Gameplay (reuses `sharedRenderSequence` from Game 4):**
- `items` = `sentence.words` (array of strings, not `word.split('')`).
- Chip style: variable-width (sized to word text via `doc.getTextWidth()` for PDF;
  `padding + content` for DOM), wraps to a second row for long sentences.
- Slot row: same wrap behavior as chip row.
- Per-placement correctness: chip in right slot snaps; wrong slot bounces back —
  same logic as Unscramble via `sharedCheckSequence`.
- Completion reward: **TTS reads the full sentence aloud** (`speak(words.join(' '))`)
  + chime + dot marked ✅ + auto-advance. The spoken sentence is the payoff.
- End of round: same celebration + "Play Again".

**`sentences` field is optional per item.** Items with no `sentences` array are
silently skipped in the Sentence Builder selector — not shown greyed-out, just absent.

**No word-count selector for Sentence Builder.** Play Again redraws from whatever
sentences exist for the selected category/level. No count control needed.

**TTS on sentence completion:** speak the full sentence (`speak(words.join(' '))`)
when all slots are filled correctly — this is the main reward, not just the chime.

**Data schema addition (shape only — content generated in claude.ai project chat):**
```json
"items": [{
  "id": "short-a",
  "words": [ /* unchanged */ ],
  "sentences": [
    { "words": ["The", "cat", "is", "fat"], "level": "easy" }
  ]
}]
```
Nesting under `item` (not a flat array with a `relatedItem` pointer) means the
existing category/item selector filtering works unchanged — no new join logic.

**Selector path (two options — implement Option A):**
- **Option A (preferred):** extract `getSelectorWords`'s flattening into a generic
  `flattenSelectorItems(DATA.sections, secEl, prefix, itemKey)`. Then
  `getSelectorWords` calls it with `'words'`; a new `getSelectorSentences` calls
  it with `'sentences'`. Single implementation, two consumers.
- **Option B:** write `getSelectorSentences` standalone — acceptable only if A
  requires touching more than 2–3 call sites.

**PDF (`Nyra-SentenceBuilder-<date>.pdf`):**
Per-row layout: shuffled word chips printed in a row + empty slot boxes below,
mirroring the in-app layout. Variable-width boxes sized to each word using
`doc.getTextWidth()` (same approach as the Word Match dot-placement fix) — not
fixed letter-square boxes.

**Games picker grid:** new card, `g5` id. No top-bar changes.

**Implementation:** `app/js/games/sentence-builder.js` (`g5` prefix). Does NOT use
`renderGameSection` (to avoid forcing the word-count control into the selector) — builds
setup div directly, calls `getSelectorSentences`. The `showCount: false` option was added
to `buildSelectorHTML` for this. `flattenSelectorItems` (private) was extracted in
`selector.js`; `getSelectorWords` still calls it unchanged. `sequence.js` updated to
accept optional `tileClass`/`slotClass`/`sizeToContent` params (all default to letter
style, so Unscramble callers are untouched).

**Test sentences:** a few placeholder sentences were added to `short-a` and `short-e`
items in `vowels.json` so the game is verifiable. Real curriculum sentences should be
generated in the claude.ai project chat and added under each item's `sentences` array.

## Feature spec: "Show Dad" Replay Screen ✅ BUILT

**What it is:** A post-game summary overlay that fires on completion of any game (g1–g5)
or Quiz — same trigger point that currently fires confetti + praise. One additional screen
in that existing flow. Not a new game, not a new top-level state.

**Display sequence on trigger:**
1. Pull a random praise line from `completionPraises` pool (new top-level array in
   `vowels.json` — see data section below).
2. Pull the emoji of the **last hard-tier word answered correctly** that session.
   Fallback chain: last hard-tier correct → last medium-tier correct → last correct word
   any tier → `DEFAULT_EMOJI`. Same fallback pattern already used for `word.emoji`.
3. Show a kid-readable word count: `"X words today! 🎉"` where X = total correct answers
   that session.
4. Hold the screen ~4–5 seconds before auto-dismiss. Tap anywhere to dismiss early.

**Intent:** Gives Nyra a moment to physically turn the laptop and show the parent the
score. The 4–5 second hold is deliberate — don't skip it or make it instant.

**Data: `completionPraises` array (add to `vowels.json` top level):**
```json
"completionPraises": [
  "Amazing work, Nyra! 🌟",
  "You're a star reader! ⭐",
  "Shabash! Keep going! 💪",
  "Wow, look at you go! 🚀",
  "Super smart! 🧠",
  "You did it! So proud! 🥳",
  "Reading champion! 🏆",
  "Nyra the word wizard! 🪄"
]
```
Content to be extended in claude.ai project chat. Claude Code should read the array
from `DATA.completionPraises` — never hardcode praise strings in JS.

**Data: no other changes.** No persistence, no schema change to `sections`/`items`.
Reads existing in-memory session state (correct-answer array + word difficulty tags).
Discarded on dismiss — fully stateless.

**Implementation:**
- New exported function `showReplay(playElId, correctWords, onDone)` in
  `app/js/game-engine/game-shell.js` alongside `celebrate()`.
  - `correctWords` — array of `{ word, emoji, level }` objects from that game session.
  - `onDone` — callback fired on dismiss (equivalent to the Play Again callback in
    `celebrate()`).
- Each game's completion path calls `showReplay(...)` **before** `celebrate(...)` — replay
  screen shows first, then on dismiss it fires `celebrate()`.
- `DATA.completionPraises` must be threaded down to `showReplay` — pass it as a param
  rather than importing DATA into game-shell.js. Suggested: `main.js` passes it to each
  game's render function, which stores it module-locally and passes it through to
  `showReplay`.

**Visual:**
- Centered overlay inside the play area (not full-screen modal — same card style as the
  celebrate screen).
- Big emoji (the fallback-chain emoji above), praise line, count line.
- Reuse existing confetti + `g1-celebrate-card` CSS — no new animations needed.
- Auto-dismiss countdown is not shown visually (no timer bar) — just the 4–5 second hold.

**Naming:** `showReplay()` in `game-shell.js`. No `g6` prefix — this is a shared
overlay, same family as `celebrate()`, not a standalone game.

**Implementation:** `showReplay(playElId, correctWords, praises, onDone)` added to
`game-shell.js`. Each game's render function now accepts `(sections, praises = [])`;
`main.js` passes `DATA.completionPraises` to all five games. Each game accumulates
`correctWords` as `{ word, emoji, level }` during the round. Sentence Builder uses
`'🧩'` as the emoji (sentences have no per-emoji). Quiz not wired — it has no
completion moment in the current flow. Tap-early guard: click listener deferred 800ms
to prevent accidental tap-through from the last tile placement.

**Build order:** Independent of g4/g5 — no dependencies in either direction.

## Feature spec: PDF Sticker Themes ✅ BUILT

**What it is:** A theme picker on the Worksheet tab (before "Generate PDF") that adds
emoji corner/border decorations to the printed worksheet. Tap a theme card to select it,
tap again to deselect. Defaults to no theme (clean worksheet). Purely decorative — no
change to word cells or layout logic.

**Data:** `stickerThemes` top-level array in `vowels.json` (already added). Each theme:
```json
{ "id": "unicorn", "label": "Unicorn Land", "emoji": ["🦄","🌈","✨","💖"] }
```
Read from `DATA.stickerThemes` — never hardcode theme ids or emoji in JS.

**UI (Worksheet tab):**
- Add a theme picker row above the "Generate PDF" button.
- One small card per theme: theme emoji (first emoji in the array) + label.
- Single-select: tapping a card selects it (highlighted border); tapping the selected
  card deselects it (back to no theme). No "none" card needed — deselecting achieves it.
- State is local to the Worksheet tab session, not persisted.

**PDF decoration layer (`worksheet-pdf.js`):**
- If a theme is selected, draw its 4 emoji as corner decorations: top-left, top-right,
  bottom-left, bottom-right of the page, just inside the margin.
- Use the existing Twemoji PNG pipeline (`loadEmojiImage` from `pdf-utils.js`) —
  same approach as word-cell emoji. No new asset work.
- Emoji size: ~12mm. Position: `mL - 4` / `pageW - mL - 8` for X; `mT - 4` /
  `pageH - mB - 8` for Y (adjust to taste — keep clear of the word grid).
- If no theme selected, PDF output is identical to current (no regressions).
- The 4 theme emoji map to corners in order: [top-left, top-right, bottom-left,
  bottom-right]. Cycle through the array if fewer than 4 emoji (wrap with `% length`).

**Threading:** `DATA.stickerThemes` is already available in `main.js`. Pass it into
`renderWorksheetSection(DATA.sections, DATA.stickerThemes)` — same pattern as praises.
`worksheet-pdf.js`'s `generateWorksheetPDF(words, opts)` already accepts an `opts` bag;
add `opts.theme` (the selected theme object or null).

**No regressions:** if `opts.theme` is null/undefined, PDF is byte-identical to current output.

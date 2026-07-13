# English (Phonics) — Nyra Learns with Nana

## What this is

A data-driven learning toolkit for Nyra (age 5): a self-contained HTML
web app (interactive, no build step) plus a PDF worksheet generator. Currently
covers English vowels (short, long, vowel teams, OU/OW), consonant digraphs (sh, ch, th, ph), consonant blends (pl, br, cl, cr, fl), spelling-choice patterns
(C/K/CK, AI/AY, IGH/IE/Y), and syllable awareness (clapping/counting beats,
sorting by count, building words from syllable chunks — its own independent
dataset, see "Syllables curriculum" below). Designed to extend to
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
app/data/*.json        One file per subject/unit, plus sound-sort-games.json and
                        spelling-choice.json (both manifests, see below).
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
  players.js           session-only Players scoreboard — see "Players scoreboard" section below
  emoji.js             getEmoji(), DEFAULT_EMOJI
  utils.js             shuffle(), pickBlankPositions(), escHtml()
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
    sound-sort.js      Sound Sort — generic config-driven "tap the sound bucket" engine
    sound-sort-config.js  buildSoundSortConfigs() — merges sound-sort-games.json
                        manifest with live phonics section data into full run configs
    spelling-choice.js  Spelling Choice — generic config-driven "tap the right
                        letters to finish the word" engine, reads
                        app/data/spelling-choice.json
    clap-counter.js     Clap Counter — new engine: show a word, tap 👏 once per
                        syllable, tap Done to check against syllables.json's
                        count. No scoring/streak, retry-until-correct like
                        Spelling Choice. Reads app/data/syllables.json.
    syllable-builder.js Syllable Builder — same reorder mechanic as Unscramble
                        (game-engine/sequence.js), but the chunk unit is a
                        syllable (`entry.syllables`) instead of a letter, using
                        Sentence Builder's variable-width seq-chip tiles since
                        chunks aren't 1 character. Reads app/data/syllables.json.
  pdf/
    pdf-utils.js       emojiCache, loadEmojiImage(), hexToRgb()
    worksheet-pdf.js   renderWorksheetSection, generateWorksheetPDF
    game-pdf.js        generateSpellItPDF, generateMatchPDF, generateMissingLetterPDF,
                        generateUnscramblePDF, generateSentenceBuilderPDF, generateSoundSortPDF
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
| `vowel-teams` | `ai-ay` `ee-ea` `oa-ow` `oo` `ui-ue` `oi-oy` `ou-ow` `ei-eigh` `igh-ie-y` |
| `spelling-rules` | `use-ck` `use-k` `use-c` |
| `consonant-digraphs` | `sh` `ch` `th` `ph` |
| `consonant-blends` | `pl` `br` `cl` `cr` `fl` |
| `g-variations` | `hard-g` `soft-g` |

Word counts: 30 words per item (20 for `ei-eigh`, 24 for digraphs sh/ch/th, 14 for `ph`, 18 for blends, 42 for `hard-g`, 25 for `soft-g`).

Top-level arrays: `completionPraises` (16 strings), `stickerThemes` (6 themes).

## Syllables curriculum (syllables.json)

`app/data/syllables.json` is a new sibling dataset, independent of `vowels.json` —
different schema, not a `vowels.json` section. Syllable awareness (clapping/counting
beats, sorting by count, building words from chunks) doesn't fit the
subject/section/item/word shape at all, so it gets its own flat top-level object:

```json
{
  "oneSyllable":          [ { "word": "cat", "emoji": "🐱", "syllables": ["cat"], "count": 1 } ],
  "twoSyllable":           [ { "word": "apple", "emoji": "🍎", "syllables": ["ap", "ple"], "count": 2 } ],
  "threeSyllable":         [ { "word": "banana", "emoji": "🍌", "syllables": ["ba", "na", "na"], "count": 3 } ],
  "fourSyllableChallenge": [ { "word": "alligator", "emoji": "🐊", "syllables": ["al","li","ga","tor"], "count": 4 } ]
}
```

Four tiers, each a flat array (no nested items/sections). `count` always equals
`syllables.length` — kept as an explicit field rather than derived, since Clap
Counter needs to compare it directly against a tap count. `fourSyllableChallenge`
(12 words) is deliberately excluded from every game's *default* deck — each of the
three syllables games below has its own opt-in "🏆 Challenge Mode" checkbox
(off by default) that folds it in; nothing reads it unconditionally. Word counts:
32 one-syllable, 34 two-syllable, 30 three-syllable, 12 four-syllable-challenge.

Three games consume this file — Syllable Sort (reuses Sound Sort), Clap Counter
(new engine), and Syllable Builder (reuses Unscramble's reorder mechanic) — see
their respective sections below.

## Sound Sort games (config-driven)

**Games list (Games picker grid):** Quiz, Letter Builder, Word Match, Missing Letter,
Unscramble, Sentence Builder, Sound Sort, Spelling Choice. Sound Sort is one entry
point, dynamically instantiated once per config — not one hardcoded game like the
others; likewise Spelling Choice mounts one set-picker covering all its `sets[]`.

`sound-sort.js` is a generic engine: "show one word, tap which of 2–3 sound-category
buckets it belongs to." It has no G-specific (or any subject-specific) code. Each
instance is built from a config shaped:

```json
{
  "gameId": "sound-sort-g",
  "icon": "🦒",
  "title": "Hard G or Soft G?",
  "instructions": "Is it a hard /g/ or soft /j/ sound?",
  "theme": null,
  "categories": [
    { "id": "hard-g", "label": "Hard G", "symbol": "/g/", "color": "#4A90D9" },
    { "id": "soft-g", "label": "Soft G", "symbol": "/j/", "color": "#D97A4A" }
  ],
  "deck": [
    { "word": "gum", "emoji": "🍬", "level": "easy", "answer": "hard-g" }
  ]
}
```

This full config is never hand-written — `sound-sort-config.js`'s `buildSoundSortConfigs()`
derives it at load time from a manifest plus one word-data source, so word lists are
never duplicated. The manifest, `app/data/sound-sort-games.json`, holds just the
per-game cosmetic metadata that doesn't exist in the word-data schema (`gameId`,
`icon`, `title`, `instructions`, optional `theme`, and per-category `symbol`/`color`/
`label`) plus one of two pointers to where the actual words/categories live:
- `sectionId` — the original path. Looks up a `vowels.json` section whose items map
  1:1 onto this game's categories (each item *is* one category); supplies `deck`
  (every word/emoji/level from that section's items) and each category's `label`
  (pulled from the matching item's `label`, e.g. `g-variations`'s `hard-g`/`soft-g`).
- `setId` — used when a game's categories don't correspond to separate phonics items
  (e.g. igh/ie/y are one bundled `vowel-teams` item, not three separate ones). Looks
  up a Spelling Choice set (`app/data/spelling-choice.json`) instead, whose deck
  entries already carry a per-word `answer` matching a category id — so the
  igh/ie/y-per-word mapping is read from Spelling Choice, never hand-duplicated into
  `sound-sort-games.json`. `label`/`symbol`/`color` per category come straight from
  the manifest entry itself in this path (there's no phonics item to pull `label` from).
- `tiers` — used when the word source isn't sections/items at all: an array of
  `{ tierKey, id, label, color, symbol }` pointing at flat top-level arrays in
  `syllables.json` (e.g. `tierKey: "oneSyllable"`). An optional sibling
  `challengeTier` (same shape, singular, pointing at `fourSyllableChallenge`) is
  parsed the same way into `config.challengeCategory`/`config.challengeDeck` —
  kept separate from `categories`/`deck` so the base game never includes it; see
  "Challenge Mode" below for how it gets folded in at runtime.

**Live configs:** `sound-sort-g` (`sectionId`, deck derived from the `g-variations`
section of `vowels.json` — 42 hard-g + 25 soft-g words), `sound-sort-igh-ie-y`
("Ice Cream Scoops", `setId: "igh-ie-y"`, deck derived from Spelling Choice's
`igh-ie-y` set — same 17 words feeding that game's IGH/IE/Y set, single source of
truth, no duplication), and `sound-sort-syllables` ("Syllable Sort", `tiers` pointing
at `syllables.json`'s `oneSyllable`/`twoSyllable`/`threeSyllable`, `theme: "icecream"`
— cones map naturally onto "how many syllables/scoops," and `challengeTier` pointing
at `fourSyllableChallenge`).

**Challenge Mode** (`sound-sort.js`, only rendered when `config.challengeCategory` is
set): a single "🏆 Challenge Mode" checkbox injected into the setup screen right
before the Start/PDF button row — deliberately outside the regular category/level/
count selector, so it stays one obvious opt-in toggle instead of being buried in the
expandable category checkboxes. Off by default. `startRound` reads the checkbox at
round-start time (not baked into the config) and, if checked, folds in
`CHALLENGE_EXTRA_WORDS` (4) shuffled words from `config.challengeDeck` plus the
challenge category itself into `round.activeCategories` — the *only* thing
`renderRound`/`handleTap`/the icecream scoop logic read for "how many buckets and
which ones," never `config.categories` directly, so a config without a
`challengeCategory` behaves exactly as before (`round.activeCategories` just equals
`config.categories`). Purely additive, zero risk to `sound-sort-g`/`sound-sort-igh-ie-y`.

**Optional `theme` field** (`sound-sort.js`): purely additive — omitted or `null`
renders the original plain colored-bucket buckets unchanged. `theme: "icecream"`
renders the categories as ice-cream cones (simple CSS triangle + circles, no image
assets) instead, and each correct sort stacks a scoop on the matching cone
(`round.scoopCounts`, capped at `MAX_VISIBLE_SCOOPS = 6` — past that the cone stays
at 6 scoops and a small `×N` badge keeps the count going numerically). Only the
bucket *rendering* changes; interaction, scoring, and the shake/correct feedback are
identical to the plain-bucket path. The next themed Sound Sort variant only needs a
new config (and a new `theme` value if it wants a new visual skin) — no engine changes.

**Adding the next sound-sort game requires zero engine code changes** — only a new
entry in `sound-sort-games.json`, pointing at a phonics section (`sectionId`, when
categories map 1:1 onto separate items) or a Spelling Choice set (`setId`, when they
don't). `main.js` loops over every config `buildSoundSortConfigs()` returns, mounting
a game section and a Games-grid card for each — no per-game wiring in `main.js` or
`nav.js` either.

Reuses existing engine pieces rather than reimplementing: `renderGameSection`/
`celebrate`/`showReplay` from `game-shell.js` (setup screen, confetti, praise pool),
`getSelectorWords`/`buildSelectorHTML` from `selector.js` (category/level/count
picker — each config's categories are exposed as one section's checkbox items;
`getSelectorWords` also tags each returned word with its source `itemId` so the
engine can recover the correct-answer category), `speak`/`playChime` for round
mechanics, and the `.quiz-card`/`.quiz-word`/`.score-bar` CSS classes from Quiz for
the play screen. Only new pieces: the `.sort-bucket-btn` CSS (N-column tap-target
buttons colored per category) and `generateSoundSortPDF` in `game-pdf.js` (prints a
circle-the-answer worksheet).

Tapping the word/emoji (not a bucket) re-speaks it via `speak()`, matching the
app-wide "tap words to hear them" convention — same interaction as the Learn tab's
word chips, without affecting round state or counting as an answer.

## Spelling Choice game (config-driven)

`spelling-choice.js` is a generic engine: "show a picture + a partially-spelled
word, tap the correct chunk from a small fixed set of choices" (e.g. `si__` + 🤒,
choices `[c, k, ck]`, answer `ck`). Config-driven the same way as Sound Sort, reading
`app/data/spelling-choice.json`:

```json
{
  "gameId": "spelling-choice",
  "sets": [
    {
      "id": "c-k-ck",
      "title": "C, K, or CK?",
      "choices": ["c", "k", "ck"],
      "deck": [
        { "word": "sick", "prefix": "si", "suffix": "", "answer": "ck", "emoji": "🤒" }
      ]
    }
  ]
}
```

Each deck entry is `{word, prefix, suffix, answer, emoji}` — the blank renders
between `prefix` and `suffix` (`.spell-word`/`.spell-blank` CSS, sized to the
longest choice in that set so the blank's width never hints at the answer's letter
count); `choices` are per-set and fixed (every word in a set shows the full set of
choices, never a subset, shuffled in display order only).

Tapping the setup screen shows one card per `sets[]` entry (title + a few example
emoji), reusing `.topic-card` styling from Quiz's topic picker. Picking a set starts
a drill reusing Quiz's `.quiz-card`/`.quiz-options`/`.quiz-btn` CSS and the
`⭐ Score N / Total` `.score-bar` verbatim. Correct tap: green flash + a random
`completionPraises` message + chime + auto-advance after a beat, same pattern as
Sound Sort. Wrong tap: red shake (`.quiz-btn.shake`, reuses the `g1Shake` keyframes)
on just that button, which then stays disabled — the word doesn't advance, so she
retries from the remaining choices. `finishRound()` reuses `showReplay`/`celebrate`
from `game-shell.js` rather than hand-rolling a summary screen.

Doesn't use `renderGameSection`/`selector.js` (no category/level/count picker — sets
are a small fixed list, not a phonics section) and has no PDF export yet, matching
Quiz's current unwired state for that piece (see "Later scope" below). It does wire
Players manually the same way Sound Sort does: `buildPlayersSetupHTML`/
`setupPlayersUI` render the optional name/avatar setup block under the set-picker
(built once, shared across all sets); tapping a set card calls `startPlayersRound`,
which snapshots whatever was typed there. Since every word is retried until correct
(no wrong-answer turn-ending), a correct tap credits the current player
(`creditCurrentPlayer`) and advances the turn (`advanceTurn`) together — same
"completion == point == turn end" semantics as `onItemComplete`, just not called
through that helper because the score/no-score branch needs to fork on
`getPlayersState(PREFIX).players.length` first. `finishRound()` branches three ways:
0 players keeps the original solo `showReplay`/`celebrate` flow unchanged; 1 or 2
players first shows a brief score/tie/winner summary (`renderPlayerCardRow`, mirrors
Sound Sort's finish screen) before the same replay/celebrate. "Play Again" passes the
just-finished `players` array back into `startPlayersRound` as its replay snapshot,
so a rematch keeps the same names/avatars and resets scores to 0.

Tapping the emoji/word (`#sc-word-tap`, wraps both) speaks the full word via
`speak()`, same "tap words to hear them" convention as everywhere else in the app —
safe here because every set is a same-sound/different-spelling choice (e.g. `rain`
and `day` sound identical in their vowel), so hearing the word never reveals which
spelling is correct.

**First three live sets:** `c-k-ck`, `ai-ay`, `igh-ie-y` — the last shares its word
list 1:1 with Sound Sort's `sound-sort-igh-ie-y` config (see above), read from this
same file via `setId`, never duplicated as a second hand-written list.

**Adding the next spelling-pattern set (e.g. a future OI/OY) requires zero engine
code changes** — only a new object in `spelling-choice.json`'s `sets[]`.

## Clap Counter (new engine)

`clap-counter.js` — "show a word, clap once per syllable you hear, tap Done to
check." No existing game had a tap-and-count mechanic, so this is the one fully new
engine in the syllables curriculum (Syllable Sort and Syllable Builder both reuse
existing engines — see their sections). Hand-built setup (word count + Challenge
Mode checkbox, no `renderGameSection`/`selector.js` — there's no category/level
concept here, just a flat pool with one opt-in toggle), deck pulled straight from
`syllables.json`'s `oneSyllable`/`twoSyllable`/`threeSyllable` (+ `fourSyllableChallenge`
if Challenge Mode is checked), shuffled and sliced to the requested count.

Each word: tapping 👏 increments a visible counter (`round.taps`) with a chime and a
CSS bump animation (`.cc-clap-btn.tapped`, `ccBump` keyframes); tapping "✅ Done"
compares `round.taps` to `entry.count`. Correct → praise pool message + reveals the
syllable breakdown (`entry.syllables.join('-')`, e.g. "ba-na-na") + auto-advance.
Incorrect → gentle retry prompt, taps reset to 0, same word (no advance) — same
stay-on-the-word-until-correct pattern as Spelling Choice. **No scoring/streak by
design** (per spec) and **no Players-scoreboard wiring** — deliberately kept simple,
unlike Spelling Choice which got Players wired in on request; add it later the same
way (`buildPlayersSetupHTML`/`creditCurrentPlayer`/`advanceTurn`) if needed.

Word is never auto-spoken with a syllable pause (Web Speech API has no SSML break
support via plain utterance text) — `speak(current.word)` just fires normally on
render and on tapping the emoji/word, same as everywhere else in the app; per spec
("don't over-engineer this part"), no attempt is made to insert artificial pauses.

## Syllable Builder (reuses Unscramble's reorder mechanic)

`syllable-builder.js` — same drag/tap-to-reorder mechanic as Unscramble
(`game-engine/sequence.js`: `buildSeqState`/`renderSeqTiles`/`renderSeqSlots`/
`wireSeqSlots`/`trySeqPlace`), but the chunk unit is a syllable (`entry.syllables`,
e.g. `["ba","na","na"]`) instead of a single letter (`word.split('')`) — zero changes
needed to `sequence.js` itself, since it already operates on arbitrary text tokens
matched by content, not length. Uses the `seq-chip`/`seq-chip-slot` CSS classes
(Sentence Builder's variable-width tile/slot variant) rather than Unscramble's
fixed 44px `seq-tile`/`seq-slot`, since syllable chunks range from 1 to ~6 characters.

Hand-built setup (word count + Challenge Mode checkbox), same shape as Clap Counter
— no `renderGameSection`/`selector.js`, since there's no category/level concept, and
no PDF export (out of scope for this curriculum pass). Deck pulled straight from
`syllables.json`'s three base tiers (+ `fourSyllableChallenge` if Challenge Mode is
checked), mirroring Unscramble's `g1-progress-strip`/`sharedRenderStrip` per-word
progress chips. On completing a word: reveals `"{word} — {count} syllable(s)!"` (e.g.
"banana — 3 syllables!") alongside the usual chime, then advances — same
find-next-undone-word loop as `unscramble.js`'s `g4Advance`. Finish screen reuses
`showReplay`/`celebrate` from `game-shell.js`; "Play Again" restarts immediately
(`startRound` directly, not a return-to-setup step). **No Players-scoreboard wiring**
in this pass either, for the same reason as Clap Counter — can be added later
mirroring `unscramble.js`'s `onItemComplete('g4')` usage, since the per-word
completion model is identical.

## Players scoreboard (session-only)

Optional, opt-in sibling-competition mode: 1-2 kids each pick a name + an avatar
(emoji or a photo — see below) before a round; if 2 are entered, a big photo-style
scorecard row replaces the plain score bar during play, turns alternate strictly
sequentially (Player 1, 2, 1, 2…), and the active player is highlighted. Entirely
in-memory — matches the app's existing convention of zero `localStorage`/
`sessionStorage` usage anywhere; nothing survives a page reload, by design ("just
session," not a profile system).

**`players.js`** owns this, mirroring the `selector.js` split: `buildPlayersSetupHTML`/
`setupPlayersUI` (name input + avatar picker) build and wire the optional setup
mini-form; `getPlayers` reads it back (`[]` if no name was typed in either slot);
a shared `Map`-based registry keyed by game `prefix` holds live scores so no game's
`startFn(containerEl, words)` signature needs to change. `renderPlayerBar`/
`renderPlayerCardRow` render the card row (blank `''` when 0 players — safe to
splice into any template unconditionally). `creditCurrentPlayer`/`advanceTurn` are
the two primitives; `onItemComplete` bundles both for games with no wrong-answer
concept (every completed item is simultaneously a point and the end of that turn).

**Avatar: emoji or photo, same round frame.** `avatar` stays a single string field
everywhere (registry, `slot.dataset.emoji`, replay snapshots) — either a plain emoji
grapheme, or a `blob:` object URL, distinguished by `isPhotoAvatar()` (checks the
`blob:` prefix). `avatarInnerHTML()` renders either into the *same* circular
`.plyr-avatar-btn` (setup) / `.plyr-avatar` (scoreboard card) containers — a photo
just gets `object-fit:cover; border-radius:50%` (`.plyr-avatar-img`) to match the
emoji's existing round frame, so no separate "photo card" layout was needed. The
avatar picker popover (`.plyr-emoji-picker`) has the fixed emoji grid plus one more
option, 📷, opening `.plyr-camera-panel`:
1. Tries `getUserMedia({ video: { facingMode: 'user' } })` for a live front-camera
   preview. The `<video>` is CSS-mirrored (`scaleX(-1)`) for a natural selfie feel,
   but the canvas capture draws from the raw, unmirrored video element, so the
   saved photo comes out correctly oriented (as others actually see the child) —
   the mirroring is display-only and doesn't touch the captured frame.
2. Capture center-crops to a square canvas (`Math.min(videoWidth, videoHeight)`)
   and calls `canvas.toBlob` → `URL.createObjectURL`, then shows a ✅ Use / 🔄 Retake
   preview step before committing to the slot.
3. If `getUserMedia` throws or isn't available (denied permission, no camera,
   insecure context — anything not `https:`/`localhost`), falls back to a plain
   `<input type="file" accept="image/*" capture="user">`, same preview/confirm step.
4. Camera streams are stopped (`getTracks().forEach(t => t.stop())`) on every exit
   path (capture, cancel, retake, closing the panel to pick an emoji instead,
   removing player 2) via `stopSlotCamera()`, tracked as a plain `_camStream`
   property on the slot element (not `dataset` — a `MediaStream` isn't a string).
   Object URLs are revoked (`URL.revokeObjectURL`) whenever a slot's avatar is
   replaced or the slot is cleared, so retaken/discarded photos don't leak blobs.

**Live in `game-shell.js`** via a new `enablePlayers = true` param on `renderGameSection` —
the setup-screen injection and `startPlayersRound(div, prefix)` call happen there once,
so Letter Builder, Missing Letter, Unscramble, and Sound Sort each only needed a
`renderPlayerBar(prefix)` mount line, one `onItemComplete(prefix)` (or, for Sound
Sort, `creditCurrentPlayer`/`advanceTurn` separately, since it distinguishes
right/wrong) at their existing per-word completion point, and one
`startPlayersRound(secEl, prefix, getPlayersState(prefix).players)` line in their
`onPlayAgain` (keeps names/avatars, resets scores to 0 on a rematch). Zero players
entered reproduces every game's exact pre-feature behavior — verified as the primary
invariant, since this is a shared-shell change touching every `renderGameSection` caller.

`getSelectorWords(sections, containerEl, prefix, { playerCount })` (`selector.js`) rounds
the round's word count to the nearest multiple of `playerCount` via `roundToNearestMultiple`
(`utils.js`, ties round up, floored at `playerCount` itself), so an N-player round always
splits into equal turns — e.g. 5 words entered + 2 players → 6. Every call site that starts
or restarts a round (the shared Start-button handler in `game-shell.js`, and each wired
game's own `onPlayAgain`) passes `playerCount: <players active>.length || 1`, checked fresh
each time — not baked into the word-count field itself, so solo play (`playerCount === 1`,
a no-op multiple) is never forced off its entered count. `MAX_PLAYERS` in `players.js` is 2
today, but this rounding logic is not 2-specific — raising that cap later needs no changes
here.

**`word-match.js` passes `enablePlayers: false` — intentionally excluded.** Its board
shows every word/emoji pair clickable at once (no single "current item" the way every
other game has), so "whose turn" could only ever be an unenforced honor-system
convention there. Decided against shipping that ambiguity for this game specifically.

### Later scope (deferred, not yet built)

- **`quiz.js` wiring.** Doesn't call `renderGameSection` at all — hand-built setup/play
  screens, flat module-level `score`/`total`/`currentQ` globals, and a **manual**
  "Next Word ➡️" advance (not auto-advance like every other game), so it needs the
  same `players.js` primitives wired by hand rather than inherited "for free" from the
  shared shell change.
- **`sentence-builder.js` wiring.** Also doesn't call `renderGameSection` (hand-builds
  its own `#sec-game5` shell) — needs the same setup-screen block added by hand,
  mirroring exactly what the shell change gives the other four games automatically.

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

- Worksheets default to 25 words per section. A "🎲 Mix all selected words together"
  toggle (`wsMixAll` checkbox in `worksheet-pdf.js`) switches the word-count field
  between "Words per category" (default: one block per selected category, current
  behavior) and "Total words" (one shuffled `Mixed Practice` block pooling words
  across every selected category/item) — mutually exclusive with "Include teaching
  notes" (notes are per-item and don't apply once categories are mixed together).
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

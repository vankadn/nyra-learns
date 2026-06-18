# Nyra Learns with Nana — Multi-Subject Learning App

## What this is

A data-driven learning toolkit for Nyra (age 5): a self-contained HTML
web app (interactive, no build step) plus a PDF worksheet generator. Currently
covers English vowels (short, long, vowel teams, OU/OW). Designed to extend to
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
category name into `index.html` or `generate.py`, stop — it belongs in JSON.

## Project layout

```
app/index.html        Self-contained web app. No external JS dependencies.
                       Reads app/data/*.json at load time, renders tabs/
                       sections/quiz from it. TTS via browser SpeechSynthesis.
app/data/*.json        One file per subject/unit. See schema below.
worksheets/generate.py PDF generator (reportlab). Reads the same JSON files.
                       25 words per section, compact layout — no separate
                       blank-line table, write-line lives inside each word
                       cell. Use KeepTogether so a section header never gets
                       orphaned from its table across a page break.
```

## Data file schema (app/data/*.json)

```json
{
  "metadata": { "subject": "string", "unit": "string", "version": "string" },
  "sections": [
    {
      "id": "kebab-case-id", "title": "string", "color": "#hex",
      "items": [
        { "id": "kebab-case-id", "label": "string", "words": ["word", ...] }
      ]
    }
  ]
}
```

Adding a new subject = adding a new JSON file matching this schema. Do not
change `index.html` or `generate.py` to add subject-specific logic.

## Workflow split (where to ask what)

New homework notes/photos and curriculum questions ("which section does this
word belong in", "why is this word an exception") go in the claude.ai project
chat, not here — that chat holds the curriculum memory and conventions, and
produces ready-to-paste JSON data blocks. This repo (and Claude Code) is for
wiring that JSON into the app/worksheet and running things, not for deciding
what content goes in.

## Commands

```bash
# Run the app locally
python3 -m http.server 8000      # then open http://localhost:8000/app/

# Generate a worksheet PDF from a data file
cd worksheets && python3 generate.py --data ../app/data/vowels.json --output output/

# Preview a generated PDF as images (sanity-check layout before sharing)
python3 -c "from pdf2image import convert_from_path; [im.save(f'p{i}.png') for i,im in enumerate(convert_from_path('FILE.pdf', dpi=100))]"
```

## Conventions

- Worksheets default to 25 words per section unless told otherwise.
- Avoid emoji glyphs in PDF text (reportlab's base fonts render them as boxes);
  use plain words or simple shapes instead.
- Deploy target is Netlify Drop or GitHub Pages — no server, no build step.

## Feature spec: in-app customizable PDF worksheet generator

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
  something like `Nyra-Worksheet-<date>.pdf`.

**PDF output requirements (mirror generate.py's layout rules):**
- One section per selected category, each word with a short write-line
  beneath it, grid layout, compact — no wasted blank space.
- Use a sensible column count (4-5) based on page width.
- Avoid emoji in the rendered PDF text.
- Keep section header + its word grid together (don't orphan a header alone
  at the bottom of a page).

**Out of scope for v1:** server-side generation, saving past worksheets,
mixing word counts per individual item within a category (count is per
category only).

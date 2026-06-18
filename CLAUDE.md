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

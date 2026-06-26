# Nyra Learns with Nana

A multi-subject learning app for Nyra (age 5).

## Apps

| App | Local path | Live URL |
|---|---|---|
| English (Phonics) | `english/app/` | `vankadn.github.io/nyra-learns/english/app/` |
| Music (Bhajans) | `music/` | `vankadn.github.io/nyra-learns/music/` |
| Math | *(not started)* | — |

## Run locally

From the repo root:

```bash
python3 -m http.server 8000
```

| What | URL |
|---|---|
| Landing page | http://localhost:8000/ |
| English (Phonics) | http://localhost:8000/english/app/ |
| Music (Bhajans) | http://localhost:8000/music/ |

> **Must be served over HTTP** — opening `index.html` directly via `file://` is blocked
> by Chrome's CORS policy (ES modules + `file://` = blocked).

## Testing each app

### English (Phonics)

No setup needed — works immediately at `http://localhost:8000/english/app/`.

Verify: tab bar loads all sections (Short Vowels → Blends), Games grid shows 6 cards,
Worksheet tab renders category checkboxes.

### Music (Bhajans)

Requires Google OAuth. Sign-in **only works on the deployed domain** (`vankadn.github.io`) —
`http://localhost:8000` is not a registered JS origin on the OAuth client.

To test locally:
1. Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
2. Open the OAuth Client ID
3. Add `http://localhost:8000` to **Authorized JavaScript origins**
4. Save, wait ~5 minutes for propagation, then sign in at `http://localhost:8000/music/`

To test on the deployed site: visit `vankadn.github.io/nyra-learns/music/` and sign in
with a Google account added as a test user on the OAuth consent screen.

### Generating a worksheet PDF (English)

```bash
cd english/worksheets
python3 generate.py --data ../app/data/vowels.json --output output/
```

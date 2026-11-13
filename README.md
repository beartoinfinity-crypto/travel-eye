# travel-eye ・ 旅行手帳

A Japanese stationery-style travel notebook. **One trip = one HTML file.** The landing page collects every trip as a card, and each card opens its own self-contained page.

Built as plain static HTML — no framework, no build tooling for the site itself. Open a file and it works.

For the developer handoff — layout, privacy model, deploy settings, known limits — see [`HANDOFF.md`](HANDOFF.md).

## Layout

| Path | Purpose |
| --- | --- |
| `index.html`, `sendai-2026.html` | **Your real pages** in the project root. Git-ignored — never pushed. |
| `docs/` | The **masked** build that is published. This is what GitHub Pages serves. |
| `docs/trips.json` | Cards published from the browser; the landing page fetches it. |
| `tools/mask.mjs` | Builds `docs/` from the root pages and strips personal data. |
| `tools/publish.mjs` | One command: add the card, mask, commit and push a trip. |
| `mask.config.json` | Which patterns get masked, plus your own terms. |
| `package.json` | `npm run mask` / `check` / `dev` / `publish` |
| `vercel.json` | Tells Vercel to publish `docs/` (the repo root has no `index.html`). |

> Everything in `docs/` is generated. Edit the root pages and re-run the build — never hand-edit `docs/`.

Live site: <https://beartoinfinity-crypto.github.io/travel-eye/>

## Masking

`npm run mask` copies `index.html` and `sendai-2026.html` into `docs/`, replacing:

| Data | Example | Becomes |
| --- | --- | --- |
| Flight numbers | `JL 999` | `JL ✱✱✱` |
| Exact dates | `2030.06.14` | `2030.06.✱✱` |
| Date ranges | `06.14 – 06.21` | `06.✱✱ – 06.✱✱` |
| Short dates | `06/14` | `06/✱✱` |
| Email / phone | `me@example.com` · `9876 5432` | `✱✱✱@✱✱✱` · `✱✱✱✱ ✱✱✱✱` |

All examples above are fictional placeholders — never put real dates or flight numbers in this README.

The month, year and weekday survive so the page still reads naturally; the exact day does not.

**Private redactions belong in `mask.local.json`** — it is git-ignored, so real names never reach GitHub or Vercel:

```json
{
  "terms": [
    { "find": "陳大文", "replace": "✱✱✱" },
    { "find": "Hotel Gracery", "replace": "✱✱✱ 酒店" }
  ]
}
```

It is merged with `mask.config.json` at build time; `rules`, `terms` and `protect` all stack. Use `mask.config.json` only for generic, shareable rules.

Fictional sample text can be protected from masking:

```json
"protect": [
  { "start": "const PROMPT_TEMPLATE = [", "end": "].join('\\n');" }
]
```

### Before pushing

```powershell
npm run mask      # rebuild docs/
npm run check     # fails if docs/ is stale or still has raw dates / flight numbers / emails
```

`npm run check` exits non-zero on any leak, so it is safe to wire into CI or a pre-push hook. It also masks and leak-scans `docs/trips.json`, and no longer reports browser-published pages as orphans.

## Deploying

The published folder is **`docs/`**, because the real pages in the repo root are git-ignored. Two hosts are already set up for that:

| Host | Config | URL |
| --- | --- | --- |
| GitHub Pages | `main` → `/docs` | <https://beartoinfinity-crypto.github.io/travel-eye/> |
| Vercel | `vercel.json` → `"outputDirectory": "docs"` | your-project.vercel.app |

On Vercel, import the repo and leave the framework preset as **Other** — `vercel.json` already points it at `docs/`. If you ever see a 404 at `/`, the project is serving the repo root: check that `vercel.json` is committed and that the project's **Root Directory** is empty (not `docs`).

Because `index.html` is not in Git, a Vercel deploy only ever contains masked content. `.vercelignore` also blocks the raw pages from a local `vercel` CLI upload.

Or deploy from the command line:

```powershell
npx vercel login     # once
npx vercel --prod    # reads vercel.json, uploads only docs/
```

## Using the site

Open `index.html` directly in a browser. All links are relative.

Using a local server is optional:

```powershell
python -m http.server 8000
```

## Adding a trip

### A. From the landing page (recommended)

At the bottom of `index.html`:

1. **複製生成提示詞** — the box holds a ready prompt covering the style, structure and required meta tags. Replace the 【】 placeholders with your trip details and copy it into an AI chat.
2. **貼上或選擇完成的 HTML** — paste the returned HTML, or press **📂 從裝置選擇 HTML** to load a file already saved on your device. The page reads its metadata live and suggests a filename; a picked file keeps its own name. Then either:
   - **儲存 HTML 並加入手帳** — saves the file next to `index.html` and adds the card locally, or
   - **發布到網站（GitHub）** — uploads the masked page and its card straight to `docs/` (see below).

### B. Register an existing file

Drop the HTML next to `index.html` and press「＋ 新增旅程」, then enter the filename.

### C. Permanent entry

Add an object to `BUILTIN_TRIPS` in `index.html`:

```js
{
  id: 'kansai-2027',
  title: '2027 關西 6日5夜',
  destination: '大阪・京都',
  ghost: '關西',
  start: '2027-04-01',
  end: '2027-04-06',
  days: 6,
  nights: 5,
  dateLabel: '2027.04.01 – 04.06',
  desc: '櫻花、寺廟與咖啡店，慢慢行。',
  emoji: '🌸',
  theme: 'matcha',
  href: 'kansai-2027.html',
  tags: ['櫻花', '美食', '自訂']
}
```

`theme` is `pink`, `matcha` or `tan`.

## Publishing a trip

Both paths end the same way: a masked copy in `docs/`, a card in the landing page and a push. The raw page never leaves your machine.

### From a terminal

```powershell
npm run publish -- kansai-2027.html
```

The command reads the page's `trip:*` meta tags, inserts or replaces its card in the `AUTO-TRIPS` block of `index.html`, runs the same masking as `npm run mask`, then commits `docs/kansai-2027.html` + `docs/index.html` and pushes. GitHub Pages is live about a minute later.

Useful flags:

```powershell
npm run publish -- kansai-2027.html --dry-run   # show the card, write nothing
npm run publish -- kansai-2027.html --no-push   # commit locally, push yourself
```

The page must sit in the project root and carry `<meta name="trip:title">`; the file itself stays git-ignored. The filename must not contain anything the masker redacts (dates, flight numbers, private terms) — the command rejects it, because the masked name would no longer match the card.

### From the browser

Use this when the trip was generated on a phone or a machine without the repo:

1. Paste the HTML — or press **📂 從裝置選擇 HTML** to load it from your device — then check the filename.
2. Open **發布到網站（GitHub）**.
3. Paste a **fine-grained personal access token** for this repo with **Contents: Read and write**.
4. List any private terms to redact (names, hotels, booking references), one per line.
5. Tick the confirmation and press **發布到網站**.

The page masks in the browser with the same generic rules plus your extra terms, then writes `docs/<file>` and updates `docs/trips.json` through the GitHub API. The token is kept in the page only — never stored, never committed — and is cleared after a successful publish.

> A token that can commit to the repo is powerful. Scope it to **this repository only**, give it the shortest expiry you can, and revoke it when you are done. Any script running on the same origin could read it while the tab is open.

`docs/trips.json` is the committed index of cards published from the browser. The landing page fetches it and dedupes by `href`, so it can be published from anywhere. `npm run mask` re-masks the file, and `npm run check` fails if it still contains raw data.

## Trip page metadata

For the landing page to auto-register a trip, the page should carry these tags:

```html
<meta name="trip:title" content="2027 關西 6日5夜">
<meta name="trip:destination" content="大阪・京都・奈良">
<meta name="trip:start" content="2027-04-01">
<meta name="trip:end" content="2027-04-06">
<meta name="trip:emoji" content="⛩️">
<meta name="trip:theme" content="matcha">
<meta name="trip:desc" content="櫻花、寺廟與咖啡店，慢慢行。">
```

`trip:title` is the only required one. For `npm run publish`, include it explicitly; the landing workbench falls back to `<title>`. Dates use `YYYY-MM-DD`.

Add a back link so the trip page can return:

```html
<a class="trip-back" href="index.html">← 旅程手帳</a>
```

## Data stored in the browser

| Key | Holds |
| --- | --- |
| `travel.notebook.trips.v1` | Trip cards added from the landing page |
| `travel.notebook.prompt.v1` | Your edited generation prompt |
| `travel.notebook.names.v1` | Trip name → filename memory |
| `travel.notebook.terms.v1` | Extra redaction terms typed into the publish panel (this device only) |
| `tohoku26.rates` / `.expenses` / `.checks` | Exchange rates, expenses and checklist |

Clearing site data removes custom cards; the HTML files themselves are untouched.

## License

Personal project — no license granted for reuse of the itinerary content.

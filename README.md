# travel-eye ・ 旅行手帳

A Japanese stationery-style travel notebook. **One trip = one HTML file.** The landing page collects every trip as a card, and each card opens its own self-contained page.

Built as plain static HTML — no framework, no build tooling for the site itself. Open a file and it works.

## Layout

| Path | Purpose |
| --- | --- |
| `index.html`, `sendai-2026.html` | **Your real pages** in the project root. Git-ignored — never pushed. |
| `docs/` | The **masked** build that is published. This is what GitHub Pages serves. |
| `tools/mask.mjs` | Builds `docs/` from the root pages and strips personal data. |
| `mask.config.json` | Which patterns get masked, plus your own terms. |
| `package.json` | `npm run mask` / `npm run check` / `npm run dev` |
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

`npm run check` exits non-zero on any leak, so it is safe to wire into CI or a pre-push hook.

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
2. **貼上完成的 HTML** — paste the returned HTML. The page reads its metadata live, suggests a filename and saves the file, then adds the card.

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

`trip:title` is the only required one (it falls back to `<title>`). Dates use `YYYY-MM-DD`.

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
| `tohoku26.rates` / `.expenses` / `.checks` | Exchange rates, expenses and checklist |

Clearing site data removes custom cards; the HTML files themselves are untouched.

## License

Personal project — no license granted for reuse of the itinerary content.

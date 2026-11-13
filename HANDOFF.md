# Handoff — travel-eye ・ 旅行手帳

Prepared 2026-11-13. Current release: **v1.0** (`400b26d`). This document is for whoever picks the project up next — human or AI.

---

## At a glance

| | |
| --- | --- |
| Repo | <https://github.com/beartoinfinity-crypto/travel-eye> (public) |
| Live (canonical) | <https://beartoinfinity-crypto.github.io/travel-eye/> |
| Vercel | Repo is deploy-ready (`vercel.json`). The literal `travel-eye.vercel.app` belongs to **another team's unrelated project** — use your own project URL. |
| Stack | Plain static HTML. No framework, no dependencies, no build step for the site itself. |
| Content language | Traditional Chinese; Japanese stationery / scrapbook visual language. |
| Tag | `v1.0` → `400b26d` (annotated) |

The model is **one trip = one HTML file**, plus a landing page that lists trips as cards.

---

## Repo layout

| Path | Role | In Git? |
| --- | --- | --- |
| `index.html` | Landing page + add-trip workbench | **No** — git-ignored |
| `sendai-2026.html` | The 2026 Tohoku trip page | **No** — git-ignored |
| `docs/` | Masked build that is published | Yes (generated) |
| `tools/mask.mjs` | Builds `docs/` from the root pages; `--check`, `--watch` | Yes |
| `mask.config.json` | Generic mask rules + protected regions | Yes |
| `mask.local.json` | Your private redactions (names, hotels, refs) | **No** — git-ignored |
| `vercel.json` | `outputDirectory: docs`, no build | Yes |
| `.vercelignore` | Blocks raw pages from CLI uploads | Yes |
| `package.json` | `mask` / `check` / `dev` scripts, version 1.0.0 | Yes |
| `README.md` | User-facing docs | Yes |

> **Critical:** the real, unmasked pages are **not in the repository**. A fresh clone only contains `docs/`. To edit content you need the root `index.html` / trip pages from the owner, or you will be editing masked copies by hand (don’t).

---

## How the site works

### Landing — `index.html`
- `BUILTIN_TRIPS` array holds permanent cards. A card has `id`, `title`, `destination`, `ghost`, `start`, `end`, `days`, `nights`, `dateLabel`, `desc`, `emoji`, `theme`, `href`, `tags`.
- `theme` is one of `pink`, `matcha`, `tan`.
- Trips added through the UI are stored in `localStorage` (`travel.notebook.trips.v1`) and merged with `BUILTIN_TRIPS`.
- Stats: number of trips and sum of days.
- Hero kicker is just `旅の記録` (no year). The faint `#heroYear` ghost is set by JS to `max(current year, latest trip year)`.
- **新旅程工作台**:
  - Left: editable prompt template. Edits persist in `travel.notebook.prompt.v1`; 「還原範本」 restores the built-in default.
  - Right: paste a finished trip HTML. It reads `trip:*` meta tags with `DOMParser`, suggests a filename, saves via `showSaveFilePicker` (falls back to download), registers a card, and remembers name → filename in `travel.notebook.names.v1`.
  - The saved file must land **in the same folder as `index.html`**, or the card link breaks.

### Trip page — `sendai-2026.html`
- Three bottom-nav views: **每日行程** / **匯率與記帳** / **行前清單**. Each keeps its own state when switching.
- Itinerary: sticky horizontally scrollable Day tabs, spot cards with time, category, place, note, stamp, and a Google Maps button (`maps/search/?api=1&query=…`).
- Rates/expenses: JPY → TWD/HKD, editable rate, add/delete expenses, persisted.
- Checklist: check, add custom items, reset, persisted.
- Back link `← 旅程手帳` (`href="index.html"`) on all three views.
- Keys used: `tohoku26.rates`, `tohoku26.expenses`, `tohoku26.checks`. New trips should use their own slug prefix (`kansai27.*`, …).

### Trip metadata contract
A trip page should carry these so the landing page can auto-register it:

```html
<meta name="trip:title" content="2027 關西 6日5夜">
<meta name="trip:destination" content="大阪・京都・奈良">
<meta name="trip:start" content="2027-04-01">
<meta name="trip:end" content="2027-04-06">
<meta name="trip:emoji" content="⛩️">
<meta name="trip:theme" content="matcha">
<meta name="trip:desc" content="櫻花、寺廟與咖啡店，慢慢行。">
```

`trip:title` is the only required one. Dates are `YYYY-MM-DD`.

---

## Everyday workflow

```powershell
# 1. edit the real page at the repo root
# 2. rebuild the publishable copy
npm run mask

# 3. verify: fails if docs/ is stale or still contains raw data
npm run check

# 4. commit and push the generated docs/
git add -A
git commit -m "…"
git push
```

`npm run dev` rebuilds on save (`--watch`, root HTML files only).

**Never hand-edit `docs/`.** It is always regenerated from the root pages.

### Adding a trip

1. **From the landing page (recommended)** — fill the prompt, generate with an AI, paste the HTML into 新旅程工作台, save, then `npm run mask` and commit.
2. **Existing file** — drop the HTML next to `index.html`, press 「＋ 新增旅程」, enter the filename.
3. **Permanent entry** — add an object to `BUILTIN_TRIPS` in `index.html`.

---

## Privacy model

The repo is public, so publishing is a **masked build**, not the raw pages.

| Rule | Example (fictional) | Result |
| --- | --- | --- |
| `flight-number` | `JL 999` | `JL ✱✱✱` |
| `date-iso` | `2030-06-14` | `2030-06-✱✱` |
| `date-dotted` | `2030.06.14` | `2030.06.✱✱` |
| `date-dotted-short` | `06.14` | `06.✱✱` |
| `date-slash` | `06/14` | `06/✱✱` |
| `email` / `phone` | `me@example.com` · `9876 5432` | `✱✱✱@✱✱✱` · `✱✱✱✱ ✱✱✱✱` |

- Year, month and weekday survive so pages still read naturally; the exact day does not.
- Current build masks **29 values**: `index.html` 4, `sendai-2026.html` 25.
- Private terms go in **`mask.local.json`** (git-ignored). It is merged with `mask.config.json`; `rules`, `terms`, `protect` all stack. The reader tolerates a UTF-8 BOM.
- Protected region: the `const PROMPT_TEMPLATE = [ … ].join('\n');` block is excluded from masking, so its fictional samples (`2027-04-01`, `UO850`) stay readable. Leak scanning skips that region too.
- The phone rule needs a separator so it cannot mask plain numbers such as `86400000`.
- `npm run check` exits 1 on stale `docs/` or any leftover full date / flight number / email.

### History note
History was rewritten before `v1.0` to remove real flight/date examples from early commits. The old pre-rewrite commit is still fetchable **by its exact SHA** because GitHub retains unreferenced objects — the branch, commit list and normal browsing are clean. For a hard purge, contact GitHub Support or delete/recreate the repo.

---

## Deployment

### GitHub Pages (works today)
- Source: `main` → `/docs`.
- Every push to `main` rebuilds the site. Content only changes if `docs/` changed.

### Vercel
`vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": null,
  "buildCommand": null,
  "outputDirectory": "docs"
}
```

Import the repo and use:
- Framework preset **Other**
- Root Directory **empty**
- Build Command **empty**
- Output Directory **docs**

There is deliberately no build: the raw pages are not in Git, so `npm run mask` cannot run on Vercel.

CLI alternative:
```powershell
npx vercel login
npx vercel --prod
```

### Why a 404 happens
If `/` returns Vercel's 404, the project is serving the repo root. Check `vercel.json` is on `main`, Root Directory is empty, and redeploy.

---

## Data stored in browsers

| Key | Where | Holds |
| --- | --- | --- |
| `travel.notebook.trips.v1` | landing | Trips added via UI |
| `travel.notebook.prompt.v1` | landing | Edited generation prompt |
| `travel.notebook.names.v1` | landing | Trip name → filename |
| `tohoku26.rates` | trip | Exchange rate |
| `tohoku26.expenses` | trip | Expense log |
| `tohoku26.checks` | trip | Checklist state |

Storage is per origin: the local file, GitHub Pages and Vercel each have separate data.

---

## Verified state at v1.0

- `npm run check` passes; 29 values masked; no raw dates/flights/emails in `docs/`.
- GitHub Pages serves both pages (200) and they render masked content.
- Headless-browser check: landing renders, prompt box loads the 40-line template, no console errors.
- Landing hero is `旅の記録` with no hardcoded year.
- Vercel config validated against the official schema; simulated static hosting of `docs/` returns 200 on `/`, `/index.html`, `/sendai-2026.html`.

---

## Known limitations / gotchas

1. **A clone cannot rebuild `docs/`** — the root pages are not in Git. `npm run mask` exits with “No HTML files found in the project root”.
2. `npm run check` is therefore only usable on a machine that has the raw pages.
3. Newly pasted trips are saved to the **local disk**, not uploaded. On a hosted site, the new card's link will 404 until you also commit the masked file into `docs/`.
4. Masked `start`/`end` break the landing page's `parseISO`, so the built-in masked card shows status `旅程` instead of `預定`. Accepted trade-off.
5. Only the **day** is masked; year/month/weekday remain visible by design.
6. Browser preview maps the workspace root, which is why the real pages must stay at the root (a `src/` layout was tried and abandoned).
7. `travel-eye.vercel.app` is owned by an unrelated project.
8. The old pre-rewrite commit remains reachable by SHA (see above).
9. The landing's prompt box prefers `localStorage`; press 「還原範本」 after changing the built-in template.

---

## Suggested next steps

- Add an `--audit` mode to `tools/mask.mjs` that scans only `docs/`, so CI can run without the raw pages.
- Add a GitHub Actions workflow: `npm run audit` on push/PR.
- Optionally publish a GitHub Release from tag `v1.0`.
- Optional custom domain (Pages and/or Vercel).
- If the old commit exposure matters: GitHub Support purge, or delete/recreate the repo.

---

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Vercel 404 at `/` | Output dir wrong or root directory set. `vercel.json` → `docs`, Root Directory empty. |
| Pages shows old content | `docs/` not rebuilt/committed. Run `npm run mask`, commit, push. |
| `npm run check` says “No HTML files found” | You are on a clone without the raw pages. |
| Card link 404 on hosted site | That trip file is not in `docs/`. |
| Preview pane blank | Pages must be at the repo root, not a subfolder. |
| Masking hits the wrong number | Tighten the rule in `mask.config.json`; rerun check. |
| Real name appears in `docs/` | Add a `terms` entry in `mask.local.json`, rebuild, check. |

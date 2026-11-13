# Handoff — travel-eye ・ 旅行手帳

Prepared 2026-11-13. Current release: **v1.1** (annotated tag on `main`). This document is for whoever picks the project up next — human or AI.

> **v1.1 adds** the publish flow: `tools/publish.mjs`, the browser 發布到網站 panel backed by `docs/trips.json`, and the **📂 從裝置選擇 HTML** file picker in the workbench.

---

## At a glance

| | |
| --- | --- |
| Repo | <https://github.com/beartoinfinity-crypto/travel-eye> (public) |
| Live (canonical) | <https://beartoinfinity-crypto.github.io/travel-eye/> |
| Vercel | Repo is deploy-ready (`vercel.json`). The literal `travel-eye.vercel.app` belongs to **another team's unrelated project** — use your own project URL. |
| Stack | Plain static HTML. No framework, no dependencies, no build step for the site itself. |
| Content language | Traditional Chinese; Japanese stationery / scrapbook visual language. |
| Tag | `v1.1` → this commit (annotated) |
| Previous tag | `v1.0` → `400b26d` (initial masked site + workbench) |

The model is **one trip = one HTML file**, plus a landing page that lists trips as cards.

---

## Repo layout

| Path | Role | In Git? |
| --- | --- | --- |
| `index.html` | Landing page + add-trip workbench | **No** — git-ignored |
| `sendai-2026.html` | The 2026 Tohoku trip page | **No** — git-ignored |
| `docs/` | Masked build that is published | Yes (generated) |
| `docs/trips.json` | Index of cards published from the browser | Yes |
| `tools/mask.mjs` | Builds `docs/` from the root pages; `--check`, `--watch` | Yes |
| `tools/publish.mjs` | Publish a trip: card + mask + commit + push | Yes |
| `mask.config.json` | Generic mask rules + protected regions | Yes |
| `mask.local.json` | Your private redactions (names, hotels, refs) | **No** — git-ignored |
| `vercel.json` | `outputDirectory: docs`, no build | Yes |
| `.vercelignore` | Blocks raw pages from CLI uploads | Yes |
| `package.json` | `mask` / `check` / `dev` / `publish` scripts, version 1.1.0 | Yes |
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
  - Right: paste a finished trip HTML, or load one with **📂 從裝置選擇 HTML** (`<input type="file">` + `FileReader`, 4 MB cap, BOM stripped; a picked file replaces the filename field with its own name). It reads `trip:*` meta tags with `DOMParser`, suggests a filename, saves via `showSaveFilePicker` (falls back to download), registers a card, and remembers name → filename in `travel.notebook.names.v1`.
  - The saved file must land **in the same folder as `index.html`**, or the card link breaks.
  - A collapsible **發布到網站（GitHub）** panel can instead upload the page: it masks client-side, then commits `docs/<file>` and `docs/trips.json` through the GitHub Contents API. See [Publishing](#publishing).

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

`trip:title` is the only required one for the browser workbench (it falls back to `<title>`), but `npm run publish` requires the tag. Dates are `YYYY-MM-DD`.

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

1. **From the landing page (recommended)** — fill the prompt, generate with an AI, paste the HTML into 新旅程工作台, then either save it and run `npm run mask` + commit, or use the **發布到網站** panel.
2. **One command** — `npm run publish -- kansai-2027.html` adds the card, masks, commits and pushes.
3. **Existing file** — drop the HTML next to `index.html`, press 「＋ 新增旅程」, enter the filename.
4. **Permanent entry** — add an object to `BUILTIN_TRIPS` in `index.html` (or let `tools/publish.mjs` do it inside the `AUTO-TRIPS` block).

---

## Publishing

There are two publish paths. Both produce the same result: a masked page in `docs/`, a card on the landing page, and a push that triggers GitHub Pages.

### Local command — `tools/publish.mjs`

```powershell
npm run publish -- kansai-2027.html
npm run publish -- kansai-2027.html --dry-run   # print the card, write nothing
npm run publish -- kansai-2027.html --no-push   # commit locally only
```

Steps:
1. Resolve the page in the project root (path separators and a missing `.html` are tolerated; `index.html` is rejected). It refuses a filename that masking would rewrite (date, flight number or private term), because the published path would no longer match the card.
2. Parse `trip:*` meta tags. `trip:title` is mandatory.
3. Build a card with the same field shape as `BUILTIN_TRIPS`, including `days`/`nights` and a formatted `dateLabel`.
4. Insert or replace it inside the block between
   `/* >>> AUTO-TRIPS (managed by tools/publish.mjs; do not edit by hand) */` and
   `/* <<< AUTO-TRIPS */` in `index.html`. The block is JSON, which is valid JS inside the array literal.
5. Run `tools/mask.mjs`, which rebuilds `docs/index.html` and copies `docs/<file>`.
6. If `docs/trips.json` still lists the same `href` (published earlier from a browser), remove that duplicate entry.
7. `git add` only `docs/<file>`, `docs/index.html` and, when touched, `docs/trips.json`; commit `Publish trip: <title>`; push.

The raw page stays at the root and is git-ignored. `--dry-run` writes nothing, including `index.html`.

### Browser panel

The workbench calls GitHub directly, so it works from a phone or any machine without the repo.

- Constants at the top of the publish section: `GH_REPO = 'beartoinfinity-crypto/travel-eye'`, `GH_BRANCH = 'main'`.
- The client-side masker (`MASK_RULES` + `maskClient`) duplicates the generic rules from `mask.config.json`, then replaces each extra term from `travel.notebook.terms.v1`.
- It commits `docs/<file>` first, then updates `docs/trips.json` (create or update, dedupe by `href`).
- `safeHref()` rejects `..`, leading `/` and backslashes, so a pasted filename cannot escape `docs/`; publish then rejects a name that masking would rewrite.
- The token is read from the password field, used as a bearer token, and cleared after success. It is never written to storage.
- The card is also added to `localStorage` so it appears immediately in the current browser.

**Security trade-off:** a fine-grained token with `Contents: Read and write` can commit to the repo. While the tab is open it lives in the page, and any script on the same origin could read it. Use a token scoped to this repository only, with a short expiry, and revoke it when done.

### `docs/trips.json`

Browser-published cards cannot be written into the git-ignored `index.html`, so they live in this committed JSON array instead. `loadPublishedTrips()` fetches it, normalises each entry and merges it after `BUILTIN_TRIPS` but before local custom trips; `sortedTrips()` dedupes by `href`.

`tools/mask.mjs` treats it as a build target: it re-masks the file, leak-scans it, and `--check` fails if it drifted. Pages referenced by `trips.json` are excluded from the orphan check, because they intentionally exist only in `docs/`.

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
- `docs/trips.json` is masked and leak-scanned by the same build. The browser panel cannot read `mask.local.json`, so its extra terms are typed in the publish panel and kept per device in `travel.notebook.terms.v1`; the generic rules are duplicated in `MASK_RULES` inside `index.html`. **Keep the two rule sets in sync.**
- `npm run check` exits 1 on stale `docs/`, a drifted `trips.json`, or any leftover full date / flight number / email.

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
| `travel.notebook.terms.v1` | landing | Extra redaction terms from the publish panel |
| `tohoku26.rates` | trip | Exchange rate |
| `tohoku26.expenses` | trip | Expense log |
| `tohoku26.checks` | trip | Checklist state |

Storage is per origin: the local file, GitHub Pages and Vercel each have separate data.

---

## Verified state at v1.1

- `npm run check` passes; 29 values masked; no raw dates/flights/emails in `docs/` or `docs/trips.json`.
- GitHub Pages serves both pages (200) and they render masked content; `trips.json` returns 200.
- Headless-browser check: landing renders, prompt box loads the 40-line template, no console errors.
- Landing hero is `旅の記録` with no hardcoded year.
- Vercel config validated against the official schema; simulated static hosting of `docs/` returns 200 on `/`, `/index.html`, `/sendai-2026.html`.
- Publish flow smoke-tested with a throwaway page: `--dry-run` printed the card without writing; the real run added the card, masked the page, produced `docs/<file>` and committed only the expected files. The test commit and files were removed afterwards.
- Device file picker tested in real Chrome over the DevTools protocol: selecting a file filled the textarea, set the filename to the file's own name, parsed the `trip:*` tags and enabled both buttons.
  `{"codeLength":467,"filename":"_picktest.html","status":"已讀取：2030 關西 6日5夜 · 大阪・京都・奈良 · 2030.06.14 – 06.19","saveDisabled":false,"publishDisabled":false}`

---

## Known limitations / gotchas

1. **A clone cannot rebuild `docs/`** — the root pages are not in Git. `npm run mask` exits with “No HTML files found in the project root”.
2. `npm run check` is therefore only usable on a machine that has the raw pages.
3. Saving from the workbench writes to the **local disk** only. Use **發布到網站** or `npm run publish` to put a trip online.
4. Masked `start`/`end` break the landing page's `parseISO`, so a published card shows status `旅程` instead of `預定`. Accepted trade-off; `dateLabel` keeps the human-readable range.
5. Only the **day** is masked; year/month/weekday remain visible by design.
6. Browser preview maps the workspace root, which is why the real pages must stay at the root (a `src/` layout was tried and abandoned).
7. `travel-eye.vercel.app` is owned by an unrelated project.
8. The old pre-rewrite commit remains reachable by SHA (see above).
9. The landing's prompt box prefers `localStorage`; press 「還原範本」 after changing the built-in template.
10. The browser panel holds a repo-write token in memory while publishing. Scope it narrowly and revoke it; see the security note under [Publishing](#publishing).
11. `tools/publish.mjs` stages only `docs/<file>`, `docs/index.html` and `docs/trips.json`. If `npm run mask` also refreshed unrelated pages, those stay dirty on purpose — review and commit them separately.

---

## Suggested next steps

- Add an `--audit` mode to `tools/mask.mjs` that scans only `docs/`, so CI can run without the raw pages.
- Add a GitHub Actions workflow: `npm run audit` on push/PR.
- Optionally publish a GitHub Release from tag `v1.1`.
- Optional custom domain (Pages and/or Vercel).
- If the old commit exposure matters: GitHub Support purge, or delete/recreate the repo.

---

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Vercel 404 at `/` | Output dir wrong or root directory set. `vercel.json` → `docs`, Root Directory empty. |
| Pages shows old content | `docs/` not rebuilt/committed. Run `npm run mask`, commit, push. |
| `npm run check` says “No HTML files found” | You are on a clone without the raw pages. |
| Card link 404 on hosted site | That trip file is not in `docs/`. Publish it, or check `docs/trips.json`. |
| Publish fails 401 | Token invalid or expired. |
| Publish fails 403 | Token lacks **Contents: Read and write** for this repo. |
| Publish fails 409 | The file changed between read and write; press 發布 again. |
| `npm run publish` says AUTO-TRIPS is not JSON | Someone hand-edited the block. Empty it or fix the syntax, then republish. |
| Published card missing on the live site | `docs/trips.json` was not committed, or Pages has not rebuilt yet (~1 minute). |
| Preview pane blank | Pages must be at the repo root, not a subfolder. |
| Masking hits the wrong number | Tighten the rule in `mask.config.json`; rerun check. |
| Real name appears in `docs/` | Add a `terms` entry in `mask.local.json`, rebuild, check. |

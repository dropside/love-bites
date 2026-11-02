# Love Bites

A mobile-first cooking companion for Ren: swipe through recipes, build a personal cookbook, plan the week, get a combined Woolworths NZ shopping list with real stored prices, tick things off in the store, and cook step by step.

Static site on GitHub Pages. No backend, no subscriptions, no AI at runtime, no Cookidoo.

**Live:** https://dropside.github.io/love-bites/

## Stack

React 19 + strict TypeScript, Vite, Tailwind CSS 4, Motion, Dexie (IndexedDB), React Router (hash routing, so deep links never 404 on Pages), Zod, vite-plugin-pwa, Vitest, Playwright, DM Sans.

Decisions worth knowing:
- **No shadcn/ui.** The design system in `src/components/ui.tsx` is small and purpose-built, so the extra dependency wasn't worth it.
- **Node instead of Python `recipe-scrapers`.** The pipeline shares parsing code with the app, and JSON-LD covers what we're permitted to import.
- **Hash routing** rather than a 404.html redirect: simplest thing that can't break on Pages, and it plays well with the PWA.

## Develop

```bash
npm install
npm run dev
```

| Command | What it does |
| --- | --- |
| `npm run build` | Type-check and production build |
| `npm run lint` / `npm run typecheck` | Static checks |
| `npm test` | Unit and integration tests |
| `npm run test:e2e` | Playwright browser tests (first run `npx playwright install chromium`) |
| `npm run brand` | Rebuild PWA icons from `public/images/LB_full.svg` |
| `npm run data:all` | Re-download every source and rebuild the catalogue |
| `npm run data:refresh-prices` | Refresh only Woolworths prices |
| `npm run data:audit` | Validate the built catalogue; fails on anything misleading |

## Deployment

Every push to `main` runs `.github/workflows/deploy.yml`: type-check, lint, unit tests, catalogue audit, browser tests, build, deploy. It also runs weekly to refresh prices. If the price feed fails, the last good data stays, labelled with its real date.

## Changing the kitchen code

The gate is a **convenience, not security**. GitHub Pages is public, so anyone could read the bundled data and could brute-force a weak code from the hash in the bundle. Don't put anything sensitive in deployed assets.

```bash
npm run kitchen-code -- "new code"
```

Copy the printed hash to the repository variable `KITCHEN_CODE_HASH` (Settings > Secrets and variables > Actions > Variables), then re-run the deploy workflow:

```bash
gh variable set KITCHEN_CODE_HASH --body "<hash>"
gh workflow run deploy.yml
```

Codes ignore capitals and outer spaces. Devices that were unlocked with the old code will be asked for the new one. Locally, put the hash in `.env.local` as `VITE_KITCHEN_CODE_HASH` (see `.env.example`).

## Personal data

Likes, cookbook, notes, plans, lists and pantry live in IndexedDB (`src/state/db.ts`) on that device only. Static catalogue data is separate and versioned, so deployments can't touch personal data; schema changes add a Dexie version with an upgrade step.

**Backup and restore:** Settings > Backup. Restore validates the file, then offers *merge* (keeps what's on the device, adds the rest) or *replace* (after a confirmation). Browser storage doesn't sync between devices: this is a one-primary-device app. To add sync later, `src/state/db.ts` uses stable IDs and timestamps throughout, ready for a sync service.

## Data sources and licensing

Current counts are in [reports/data-quality.md](reports/data-quality.md), generated from the data itself.

| Source | Used for | Terms |
| --- | --- | --- |
| [TheMealDB](https://www.themealdb.com/) | Full recipes, photos | [API terms](https://www.themealdb.com/terms_of_use.php) allow copying and modifying API content, with credit. The free key is for non-app-store use; it would need a paid key if published to an app store. |
| [Wikibooks Cookbook](https://en.wikibooks.org/wiki/Cookbook:Table_of_Contents) via [gossminn/wikibooks-cookbook](https://huggingface.co/datasets/gossminn/wikibooks-cookbook) | Full recipes | CC BY-SA 4.0. Attributed per recipe; derived recipe data stays under the same licence. |
| [ThermoBliss](https://thermobliss.com/), [ThermoFun](https://thermofun.com/) | Title and link only | Their recipes are the authors' copyright. We store a title derived from the public sitemap URL and link to the original. Nothing else is copied. |
| [neon-ninja/woolies](https://github.com/neon-ninja/woolies) | Woolworths NZ products and prices | MIT repo publishing a daily public snapshot. We read that file rather than calling Woolworths. Prices are generic online observations, not store-specific. Not affiliated with Woolworths. |

Not used: **Recipe Community** refuses automated access (HTTP 403), so it's not imported and no bypass was attempted. **Cookidoo** is not touched.

### Thermomix honesty

No recipe in the catalogue has verified machine settings, and none are invented. The app shows three levels: *Thermomix recipe* (link to the author's page), *TM-friendly, no settings* (dish style often suits it, by keyword), and Ren's own settings on personal copies, always labelled unverified. The cooking screen supports structured temperature, time, speed and reverse once verified data exists. The app never controls an appliance.

### Estimates, labelled as such

Servings and times are often missing from sources. When they are, the app estimates and marks them with `~`. Recipe costs only appear when at least 80% of ingredients are priced. Some kitchen conversions in `src/domain/canonicalData.ts` (like g per cup of chopped parsley) are typical reference values. Amounts like "a bunch" are flagged for review rather than converted.

## Importing recipes

- **In the app:** Settings > Recipes > Import. Takes JSON, schema.org Recipe JSON, or CSV with columns `title, servings, minutes, ingredients, steps, source_url` (separate ingredients and steps with `|`). Stored on that device only.
- **Into the shared catalogue:** add a JSON array of drafts to `data/imports/`, then `npm run data:recipes && npm run data:catalog`.

## Add another 500 recipes

Ask Claude something like: *"Find another 500 Thermomix-friendly recipes similar to Ren's favourites, prioritising cheap Woolworths ingredients."* Export a backup first so it can read her taste.

Under the hood:

```bash
npm run recipes:discover -- --urls candidates.txt --target 500 --preferences backup.json
npm run data:recipes
npm run data:catalog
npm run data:audit
```

`candidates.txt` is one recipe URL per line. Without `--license` they become link-only cards. Pass `--license "CC BY 4.0" --license-url <url>` only for a source you've confirmed permits republishing; full recipe content is then stored. robots.txt and crawl delays are honoured, blocks are skipped, and already-imported or duplicate recipes are excluded. IDs are stable, so swipes and cookbook entries are unaffected.

## Woolworths data

**Refresh:** automatic weekly, or `npm run data:refresh-prices`, then commit.

**Manual CSV** (if the feed disappears):

```bash
npm run data:products -- --csv my-products.csv --observed 2026-11-01 --source "My export"
npm run data:catalog
```

Columns: `sku,name,brand,category,pack_qty,pack_unit,price_nzd,was_nzd,member_nzd,per_kg,unit_price,unit_measure,url_slug`. `category` should use Woolworths department names, like `Pantry` or `Fruit & Veg`. Pass `--store "Woolworths Ponsonby"` only when the data really came from that store.

Prices are marked: *Observed this week*, *Recent estimate*, *Stale price* or *Unknown price*. Stock is never claimed. There's no cart integration: product links open on woolworths.co.nz.

## Code map

- `src/domain/` pure, tested logic: units, ingredient parsing, matching, pack optimisation, basket, ranking, planner
- `src/state/` IndexedDB, backup, data hooks
- `src/data/` static catalogue loading
- `src/features/` screens
- `src/components/` design system
- `scripts/` data pipeline
- `e2e/` browser tests

## Known limitations

- One device at a time; no automatic sync.
- Prices are generic online observations from a third-party snapshot, and shelf prices can differ. Member prices are shown separately where the feed marks them.
- Servings are estimated for most recipes, because TheMealDB doesn't provide them.
- Wikibooks recipes have no photos, so they get poster-style cards.
- ThermoBliss and ThermoFun titles are cleaned up from URLs, so some read slightly oddly.
- Web Wake Lock and vibration depend on the browser; iPhone Safari has limits on both.
- The feed depends on a third-party repo continuing to publish; the manual CSV path is the fallback.

## Future extensions

Sync service (stable IDs and timestamps are ready), store-specific prices when a real source exists, verified Thermomix settings as structured data, verified NZ-specific recipe sources.

// Collect another batch of recipes without duplicating or re-adding what's already there.
//
//   npm run recipes:discover -- --urls candidates.txt --target 500 --license "CC BY 4.0" --license-url https://... [--preferences backup.json]
//
// Without --license, recipes are saved as link-only cards: title and URL, nothing copied.
// With --license, only pass a source you've confirmed permits republishing: full JSON-LD content is stored.
// robots.txt is honoured, crawl delays respected, and login walls or blocks are skipped, never bypassed.
import { readFileSync } from 'node:fs';
import { getCanonical, parseIngredientLine } from '../src/domain/ingredients';
import type { Recipe } from '../src/domain/types';
import { dedupe, finalise, type RecipeDraft } from './lib/classify';
import { arg, exists, path, readJson, robotsAllows, sleep, slug, USER_AGENT, writeJson } from './lib/common';

const urlsFile = arg('urls');
if (!urlsFile) {
  console.error('Pass --urls <file with one recipe URL per line>. See README "Add another 500 recipes".');
  process.exit(1);
}
const target = parseInt(arg('target') ?? '500', 10);
const license = arg('license');
const licenseUrl = arg('license-url') ?? null;
const prefsFile = arg('preferences');
const output = path(`data/imports/batch-${new Date().toISOString().slice(0, 10)}.json`);

const existing = readJson<Recipe[]>(path('data/catalog/recipes.json'));
const existingUrls = new Set(existing.map((r) => r.source.url));

// Taste from a personal backup steers ordering only: nothing personal is written to the catalogue.
const liked = new Set<string>();
if (prefsFile) {
  const backup = readJson<{ data: { swipes?: { recipeId: string; action: string }[] } }>(prefsFile);
  const byId = new Map(existing.map((r) => [r.id, r]));
  for (const s of backup.data.swipes ?? []) {
    if (s.action !== 'love') continue;
    for (const i of byId.get(s.recipeId)?.ingredients ?? []) if (i.canonicalId) liked.add(i.canonicalId);
  }
}

interface JsonLdRecipe { '@type'?: string | string[]; name?: string; recipeIngredient?: string[]; recipeInstructions?: unknown; recipeYield?: unknown; totalTime?: string; prepTime?: string; cookTime?: string; description?: string; author?: unknown; [k: string]: unknown; }

function findRecipe(html: string): JsonLdRecipe | null {
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1]) as unknown;
      const list = (Array.isArray(data) ? data : (data as { '@graph'?: unknown[] })['@graph'] ?? [data]) as JsonLdRecipe[];
      const hit = list.find((x) => x && (x['@type'] === 'Recipe' || (Array.isArray(x['@type']) && x['@type'].includes('Recipe'))));
      if (hit) return hit;
    } catch { /* malformed block: try the next one */ }
  }
  return null;
}

const mins = (s: unknown) => {
  const m = typeof s === 'string' ? s.match(/^PT(?:(\d+)H)?(?:(\d+)M)?/) : null;
  return m && (m[1] || m[2]) ? +(m[1] ?? 0) * 60 + +(m[2] ?? 0) : null;
};
const stepsOf = (x: unknown): string[] => {
  if (typeof x === 'string') return x.split(/\n+/);
  if (!Array.isArray(x)) return [];
  return x.flatMap((s: { text?: string; itemListElement?: unknown }) => (s?.itemListElement ? stepsOf(s.itemListElement) : s?.text ? [s.text] : typeof s === 'string' ? [s] : []));
};

const urls = readFileSync(urlsFile, 'utf8').split(/\r?\n/).map((u) => u.trim()).filter((u) => u && !existingUrls.has(u));
const drafts: RecipeDraft[] = [];
const report = { attempted: 0, blockedByRobots: 0, failed: 0, noStructuredData: 0, duplicates: 0, added: 0 };

for (const url of urls) {
  if (drafts.length >= target * 1.5) break;
  report.attempted++;
  const robots = await robotsAllows(url);
  if (!robots.allowed) {
    report.blockedByRobots++;
    continue;
  }
  await sleep(robots.crawlDelayMs);
  let html: string;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) {
      report.failed++;
      continue;
    }
    html = await res.text();
  } catch {
    report.failed++;
    continue;
  }
  const r = findRecipe(html);
  if (!r?.name) {
    report.noStructuredData++;
    continue;
  }
  const host = new URL(url).hostname.replace(/^www\./, '');
  const id = `web-${slug(host.split('.')[0])}-${slug(r.name)}`;
  const licensed = Boolean(license);
  drafts.push({
    id,
    title: r.name,
    description: licensed && typeof r.description === 'string' ? r.description : null,
    ingredients: licensed ? (r.recipeIngredient ?? []).map((line, i) => parseIngredientLine(`${id}-i${i}`, line)) : [],
    stepTexts: licensed ? stepsOf(r.recipeInstructions) : [],
    source: {
      name: host,
      url,
      author: typeof r.author === 'string' ? r.author : (r.author as { name?: string })?.name ?? host,
      license: license ?? 'All rights reserved by the author: link only',
      licenseUrl,
      rights: licensed ? 'full-text' : 'link-only',
      provenance: 'schema.org JSON-LD',
      importedAt: new Date().toISOString(),
    },
    servingsHint: licensed ? parseInt(String(Array.isArray(r.recipeYield) ? r.recipeYield[0] : r.recipeYield ?? ''), 10) || null : null,
    totalMinutesHint: mins(r.totalTime),
    prepMinutesHint: mins(r.prepTime),
    cookMinutesHint: mins(r.cookTime),
    linkOnly: !licensed,
    thermomix: /thermomix|tm[567]\b/i.test(`${url} ${r.name}`) ? 'native-source' : undefined,
  });
}

const finals = drafts.map(finalise);
const scoreOf = (x: Recipe) => {
  const ids = x.ingredients.map((i) => i.canonicalId).filter((c): c is string => Boolean(c));
  const known = x.ingredients.length ? ids.length / x.ingredients.length : 0;
  const cheapStaples = ids.filter((c) => getCanonical(c)?.category === 'pantry' || getCanonical(c)?.category === 'veg').length;
  return ids.filter((c) => liked.has(c)).length * 2 + known * 5 + cheapStaples * 0.2 - x.steps.length * 0.05;
};
const { kept } = dedupe([...existing, ...finals.sort((a, b) => scoreOf(b) - scoreOf(a))]);
const existingIds = new Set(existing.map((r) => r.id));
const fresh = kept.filter((r) => !existingIds.has(r.id)).slice(0, target);
const keptIds = new Set(fresh.map((r) => r.id));
report.duplicates = finals.length - keptIds.size;
report.added = fresh.length;

const previous = exists(output) ? readJson<RecipeDraft[]>(output) : [];
writeJson(output, [...previous, ...drafts.filter((d) => keptIds.has(d.id))], true);
console.log(report);
console.log('Next: npm run data:recipes && npm run data:catalog');

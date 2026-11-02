// Validates the built catalogue and exits non-zero on anything that would mislead Ren. Run: npm run data:audit
import { z } from 'zod';
import type { CatalogManifest, MatchTable, Recipe, RecipeSummary } from '../src/domain/types';
import { path, readJson } from './lib/common';
import { titleKey } from './lib/classify';
import { unpackProducts, type PackedProduct } from '../src/data/productCodec';
import { CANONICAL_INGREDIENTS } from '../src/domain/canonicalData';

const RecipeCheck = z.object({
  id: z.string().min(1),
  title: z.string().min(2),
  completeness: z.enum(['complete', 'ingredients-verified', 'discovery-only', 'needs-review']),
  servings: z.number().int().positive(),
  source: z.object({ name: z.string().min(1), license: z.string().min(1), rights: z.enum(['full-text', 'link-only', 'user-owned']) }),
});

const manifest = readJson<CatalogManifest>(path('public/data/manifest.json'));
const index = readJson<RecipeSummary[]>(path('public/data/recipes-index.json'));
const matches = readJson<MatchTable>(path('public/data/matches.json'));
const products = unpackProducts(readJson<PackedProduct[]>(path('public/data/products.json')));
const recipes: Recipe[] = [];
for (let i = 0; i < manifest.chunks; i++) recipes.push(...readJson<Recipe[]>(path(`public/data/recipes/chunk-${i}.json`)));

const problems: string[] = [];
const fail = (s: string) => problems.push(s);

if (recipes.length !== index.length) fail(`index has ${index.length} entries but chunks hold ${recipes.length}`);
if (new Set(recipes.map((r) => r.id)).size !== recipes.length) fail('duplicate recipe IDs');
const keys = recipes.map((r) => titleKey(r.title));
if (new Set(keys).size !== keys.length) fail(`${keys.length - new Set(keys).size} duplicate normalised titles`);

const productIds = new Set(products.map((p) => p.id));
const canon = new Set(CANONICAL_INGREDIENTS.map((c) => c.id));
for (const r of recipes) {
  const res = RecipeCheck.safeParse(r);
  if (!res.success) fail(`${r.id}: ${res.error.issues[0].path.join('.')} ${res.error.issues[0].message}`);
  if (r.completeness === 'complete' && (!r.ingredients.length || !r.steps.length)) fail(`${r.id}: marked complete with missing content`);
  if (r.source.rights === 'link-only' && (r.ingredients.length || r.steps.length || r.image)) fail(`${r.id}: link-only recipe stores copied content`);
  if (r.source.rights === 'link-only' && !r.source.url) fail(`${r.id}: link-only with no link`);
  if (r.image && !r.image.rights) fail(`${r.id}: image with no rights info`);
  if (r.steps.some((s) => s.thermomix?.verified)) fail(`${r.id}: claims verified Thermomix settings in a catalogue with none`);
  for (const i of r.ingredients) if (i.canonicalId && !canon.has(i.canonicalId)) fail(`${r.id}: unknown canonical ${i.canonicalId}`);
}
for (const [c, entries] of Object.entries(matches)) {
  if (!canon.has(c)) fail(`match for unknown canonical ${c}`);
  for (const e of entries) if (!productIds.has(e.productId)) fail(`match ${c} -> missing product ${e.productId}`);
}
for (const p of products) {
  if (p.priceCents != null && !Number.isInteger(p.priceCents)) fail(`${p.id}: non-integer price`);
}
for (const r of index) {
  if (r.completeness === 'discovery-only' && r.valueCents != null) fail(`${r.id}: priced with no ingredient data`);
}
if (!manifest.products?.observedAt) fail('no price observation date');

console.log(`Audited ${recipes.length} recipes, ${products.length} products, ${Object.keys(matches).length} match entries.`);
if (problems.length) {
  console.error(`${problems.length} problems:\n${problems.slice(0, 40).join('\n')}`);
  process.exit(1);
}
console.log('All checks passed.');

// Combines normalised recipes and products into versioned static data under public/data, with pricing + a quality report.
// Run: npm run data:catalog
import { rmSync } from 'node:fs';
import { buildBasket, type BasketContext } from '../src/domain/basket';
import { CANONICAL_INGREDIENTS } from '../src/domain/canonicalData';
import { getCanonical } from '../src/domain/ingredients';
import { buildMatchTable } from '../src/domain/matching';
import { hash01 } from '../src/domain/ranking';
import type { CatalogManifest, Product, ProductCatalogMeta, Recipe, RecipeSummary } from '../src/domain/types';
import { CATALOG_SCHEMA_VERSION } from '../src/domain/types';
import { packProducts } from '../src/data/productCodec';
import { path, readJson, writeJson, writeText } from './lib/common';
import { titleKey } from './lib/classify';

const CHUNKS = 24;
const recipes = readJson<Recipe[]>(path('data/catalog/recipes.json'));
const { meta, products, rejects } = readJson<{ meta: ProductCatalogMeta; products: Product[]; rejects: Record<string, number> }>(path('data/catalog/products.json'));
const log = readJson<{ candidates: number; kept: number; stats: Record<string, number>; duplicates: unknown[] }>(path('data/catalog/import-log.json'));
const thermomixLog = readJson<{ constraints: string[] }>(path('data/raw/thermomix-links.json'));

const matches = buildMatchTable(products);
const byId = new Map(products.map((p) => [p.id, p]));
const staples = CANONICAL_INGREDIENTS.filter((c) => c.staple).map((c) => c.id);
const ctx: BasketContext = { products: byId, matches, staples };

const usedProducts = new Set(Object.values(matches).flat().map((e) => e.productId));
const summaries: RecipeSummary[] = [];
const chunks: Recipe[][] = Array.from({ length: CHUNKS }, () => []);
let pricedRecipes = 0;

for (const r of recipes) {
  const reliable = r.completeness === 'complete' || r.completeness === 'ingredients-verified';
  let valueCents: number | null = null;
  let checkoutCents: number | null = null;
  let pricedRatio = 0;
  let specials = 0;
  if (r.ingredients.length && reliable) {
    const basket = buildBasket([{ recipeId: r.id, title: r.title, ingredients: r.ingredients }], ctx);
    const relevant = basket.lines.filter((l) => !l.assumedStaple && !l.optionalOnly);
    const priced = relevant.filter((l) => l.plan);
    pricedRatio = relevant.length ? priced.length / relevant.length : 0;
    // Only show a recipe cost when nearly all of it is really priced.
    if (pricedRatio >= 0.8) {
      valueCents = basket.totals.valueCents;
      checkoutCents = basket.totals.checkoutCents;
      pricedRecipes++;
    }
    for (const l of basket.lines) {
      const top = l.plan?.lines[0];
      if (top && byId.get(top.productId)?.special) specials++;
    }
  }
  const tags = r.tags.slice();
  if (valueCents != null && valueCents / r.servings <= 500) tags.push('budget');
  const c = Math.floor(hash01(r.id) * CHUNKS);
  chunks[c].push(r);
  summaries.push({
    id: r.id,
    c,
    title: r.title,
    description: r.description,
    completeness: r.completeness,
    servings: r.servings,
    servingsVerified: r.servingsVerified,
    totalMinutes: r.totalMinutes,
    cookMinutes: r.cookMinutes,
    prepMinutes: r.prepMinutes,
    timeEstimated: r.timeEstimated,
    mealTypes: r.mealTypes,
    cuisine: r.cuisine,
    mainIngredient: r.mainIngredient,
    tags,
    dietary: r.dietary,
    allergens: r.allergens,
    hasUnknownIngredients: r.hasUnknownIngredients,
    thermomix: r.thermomix,
    image: r.image?.url ?? null,
    sourceName: r.source.name,
    sourceUrl: r.source.url,
    ingredientIds: [...new Set(r.ingredients.map((i) => i.canonicalId).filter((x): x is string => Boolean(x)))],
    valueCents,
    checkoutCents,
    pricedRatio: +pricedRatio.toFixed(2),
    specials,
  });
}

rmSync(path('public/data'), { recursive: true, force: true });
chunks.forEach((c, i) => writeJson(path(`public/data/recipes/chunk-${i}.json`), c));
writeJson(path('public/data/recipes-index.json'), summaries);
writeJson(path('public/data/products.json'), packProducts(products));
writeJson(path('public/data/matches.json'), matches);
const manifest: CatalogManifest = { schemaVersion: CATALOG_SCHEMA_VERSION, generatedAt: new Date().toISOString(), recipeCount: summaries.length, chunks: CHUNKS, products: meta };
writeJson(path('public/data/manifest.json'), manifest, true);

// ------ Quality report: actual counts only.
const count = <T>(xs: T[], f: (x: T) => string) => {
  const m: Record<string, number> = {};
  for (const x of xs) m[f(x)] = (m[f(x)] ?? 0) + 1;
  return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]));
};
const reliableRecipes = recipes.filter((r) => r.completeness === 'complete' || r.completeness === 'ingredients-verified');
const ingredientLines = reliableRecipes.flatMap((r) => r.ingredients.filter((i) => !getCanonical(i.canonicalId)?.free));
const unresolved = count(ingredientLines.filter((i) => !i.canonicalId), (i) => i.name.toLowerCase());
const usedCanon = new Set(ingredientLines.map((i) => i.canonicalId).filter((x): x is string => Boolean(x)));
const unmatchedCanon = [...usedCanon].filter((id) => !matches[id] && !getCanonical(id)?.free);
const linesMatched = ingredientLines.filter((i) => i.canonicalId && matches[i.canonicalId]).length;
const ambiguous = Object.entries(matches).filter(([, e]) => e[0].confidence < 0.7).map(([k]) => k);

const report = {
  generatedAt: manifest.generatedAt,
  recipes: {
    totalDistinct: recipes.length,
    candidatesBeforeDedupe: log.candidates,
    duplicatesRemoved: log.duplicates.length,
    byCompleteness: count(recipes, (r) => r.completeness),
    bySource: count(recipes, (r) => r.source.name),
    byRights: count(recipes, (r) => r.source.rights),
    byLicense: count(recipes, (r) => r.source.license),
    servingsStatedBySource: recipes.filter((r) => r.servingsVerified).length,
    servingsEstimated: recipes.filter((r) => !r.servingsVerified && r.ingredients.length).length,
    withUsableInstructions: recipes.filter((r) => r.steps.length > 0).length,
    thermomix: {
      nativeSourceLinkOnly: recipes.filter((r) => r.thermomix === 'native-source').length,
      suitableUnverified: recipes.filter((r) => r.thermomix === 'suitable-unverified').length,
      verifiedMachineSettings: recipes.filter((r) => r.steps.some((s) => s.thermomix?.verified)).length,
      unverifiedConversions: recipes.filter((r) => r.steps.some((s) => s.thermomix && !s.thermomix.verified)).length,
    },
    images: { withLicensedImage: recipes.filter((r) => r.image).length, withoutImage: recipes.filter((r) => !r.image).length },
    pricedRecipes,
    distinctTitleKeys: new Set(recipes.map((r) => titleKey(r.title))).size,
    importStats: log.stats,
  },
  woolworths: {
    source: meta.source,
    observedAt: meta.observedAt,
    storeContext: meta.storeContext,
    uniqueProducts: products.length,
    categories: count(products, (p) => p.dept),
    validPrices: products.filter((p) => p.priceCents != null).length,
    withPackQuantity: products.filter((p) => p.packQty != null).length,
    variableWeight: products.filter((p) => p.variable).length,
    onSpecial: products.filter((p) => p.special).length,
    storeSpecificObservations: 0,
    rejects,
    matching: {
      canonicalIngredients: CANONICAL_INGREDIENTS.length,
      canonicalMatched: Object.keys(matches).length,
      productsInMatchTable: usedProducts.size,
      ingredientLinesInReliableRecipes: ingredientLines.length,
      ingredientLinesWithProductMatch: linesMatched,
      lineMatchCoveragePct: +((linesMatched / Math.max(1, ingredientLines.length)) * 100).toFixed(1),
      canonicalUsedButUnmatched: unmatchedCanon,
      ambiguousMatches: ambiguous,
      topUnresolvedIngredients: Object.entries(unresolved).slice(0, 40),
    },
  },
  constraints: thermomixLog.constraints,
};
writeJson(path('public/data/report.json'), report, true);
writeJson(path('reports/data-quality.json'), report, true);

const md = `# Love Bites data quality report

Generated ${report.generatedAt}. Every number below is counted from the catalogue files; nothing is estimated.

## Recipes
- Total distinct: **${report.recipes.totalDistinct}** (from ${report.recipes.candidatesBeforeDedupe} candidates, ${report.recipes.duplicatesRemoved} duplicates removed)
- By completeness: ${JSON.stringify(report.recipes.byCompleteness)}
- By source: ${JSON.stringify(report.recipes.bySource)}
- By rights: ${JSON.stringify(report.recipes.byRights)}
- Servings stated by source: ${report.recipes.servingsStatedBySource}; estimated: ${report.recipes.servingsEstimated}
- With usable instructions: ${report.recipes.withUsableInstructions}
- Priced (at least 80% of ingredients priced): ${report.recipes.pricedRecipes}
- Images: ${JSON.stringify(report.recipes.images)}

### Thermomix
- Native recipes, link only: ${report.recipes.thermomix.nativeSourceLinkOnly}
- Suitable by technique, unverified: ${report.recipes.thermomix.suitableUnverified}
- With verified machine settings: ${report.recipes.thermomix.verifiedMachineSettings}
- Unverified conversions: ${report.recipes.thermomix.unverifiedConversions}

## Woolworths NZ
- Source: ${report.woolworths.source}
- Observed: ${report.woolworths.observedAt}
- Store context: ${report.woolworths.storeContext}
- Unique products: **${report.woolworths.uniqueProducts}**; valid prices: ${report.woolworths.validPrices}; pack quantities: ${report.woolworths.withPackQuantity}; variable weight: ${report.woolworths.variableWeight}
- On special: ${report.woolworths.onSpecial}. Store-specific observations: 0
- Canonical ingredients matched: ${report.woolworths.matching.canonicalMatched}/${report.woolworths.matching.canonicalIngredients}
- Ingredient line match coverage: **${report.woolworths.matching.lineMatchCoveragePct}%** (${report.woolworths.matching.ingredientLinesWithProductMatch}/${report.woolworths.matching.ingredientLinesInReliableRecipes})
- Used but unmatched: ${report.woolworths.matching.canonicalUsedButUnmatched.join(', ') || 'none'}
- Ambiguous matches: ${report.woolworths.matching.ambiguousMatches.join(', ') || 'none'}

### Top unresolved ingredients
${report.woolworths.matching.topUnresolvedIngredients.map(([n, c]) => `- ${n}: ${c}`).join('\n')}

## Source constraints
${report.constraints.map((c) => `- ${c}`).join('\n')}
`;
writeText(path('reports/data-quality.md'), md);
console.log(md.slice(0, 2400));

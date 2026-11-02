import { describe, expect, it } from 'vitest';
import { buildBasket, mergeAmounts, type BasketContext } from './basket';
import { parseIngredientLine, parseMeasuredIngredient, resolveCanonical, scaleIngredient } from './ingredients';
import { buildMatchTable, scoreProduct } from './matching';
import { getCanonical } from './ingredients';
import { optimisePacks, priceStatus, proportionalCost } from './pricing';
import { applyFilters, emptyFilters, isExcluded, learn, emptyProfile, rankDeck, scoreRecipe } from './ranking';
import { proposePlan } from './planner';
import type { Product, Recipe, RecipeIngredient, RecipeSummary } from './types';
import { convertDim, formatQuantity, normaliseUnit, parseNumber, parsePackSize } from './units';

const product = (id: string, name: string, qty: number | null, dim: Product['packDim'], cents: number | null, over: Partial<Product> = {}): Product => ({
  id, name, brand: null, dept: 'Meat & Poultry', packQty: qty, packDim: dim, variable: false, avgGrams: null,
  priceCents: cents, wasCents: null, clubCents: null, special: false, unitPriceCents: null, unitPriceMeasure: null, slug: id, ...over,
});

const ing = (id: string, canonicalId: string | null, quantity: number | null, unit: string | null, over: Partial<RecipeIngredient> = {}): RecipeIngredient => ({
  id, original: id, canonicalId, name: getCanonical(canonicalId)?.name ?? id, quantity, unit, prep: null, optional: false,
  noScale: false, confidence: 1, flags: [], ...over,
});

const ctxOf = (products: Product[], matches: BasketContext['matches'], extra: Partial<BasketContext> = {}): BasketContext => ({
  products: new Map(products.map((p) => [p.id, p])), matches, ...extra,
});

describe('unit conversion', () => {
  it('normalises metric and imperial units', () => {
    expect(normaliseUnit(1, 'kg')).toMatchObject({ quantity: 1000, unit: 'g' });
    expect(normaliseUnit(2, 'cups')).toMatchObject({ quantity: 500, unit: 'ml' });
    expect(normaliseUnit(1, 'tbsp')).toMatchObject({ quantity: 15, unit: 'ml' });
    expect(normaliseUnit(1, 'lb').quantity).toBeCloseTo(453.6);
    expect(normaliseUnit(3, null)).toMatchObject({ quantity: 3, unit: 'each' });
  });
  it('keeps vague measures vague', () => {
    expect(normaliseUnit(1, 'bunch')).toMatchObject({ unit: 'bunch', dim: null });
    expect(normaliseUnit(2, 'pinches')).toMatchObject({ unit: 'pinch', dim: null });
  });
  it('refuses volume to weight without a density', () => {
    expect(convertDim(250, 'ml', 'g', null)).toBeNull();
    expect(convertDim(250, 'ml', 'g', {})).toBeNull();
    expect(convertDim(250, 'ml', 'g', { density: 0.53 })).toBeCloseTo(132.5);
    expect(convertDim(2, 'each', 'g', { eachGrams: 150 })).toBe(300);
    expect(convertDim(2, 'each', 'ml', { eachGrams: 150 })).toBeNull();
  });
  it('parses numbers and fractions', () => {
    expect(parseNumber('1 1/2')).toBe(1.5);
    expect(parseNumber('½')).toBe(0.5);
    expect(parseNumber('1/0')).toBeNull();
    expect(parseNumber('abc')).toBeNull();
  });
  it('parses pack sizes', () => {
    expect(parsePackSize('500g')).toEqual({ qty: 500, dim: 'g' });
    expect(parsePackSize('1.5kg')).toEqual({ qty: 1500, dim: 'g' });
    expect(parsePackSize('750mL')).toEqual({ qty: 750, dim: 'ml' });
    expect(parsePackSize('1L')).toEqual({ qty: 1000, dim: 'ml' });
    expect(parsePackSize('6pack')).toEqual({ qty: 6, dim: 'each' });
    expect(parsePackSize('per kg')).toBeNull();
    expect(parsePackSize('')).toBeNull();
  });
  it('formats quantities', () => {
    expect(formatQuantity(1500, 'g')).toBe('1.5 kg');
    expect(formatQuantity(0.5, 'each')).toBe('½');
    expect(formatQuantity(2, 'bunch')).toBe('2 bunches');
  });
});

describe('ingredient normalisation', () => {
  it('resolves variants of chicken breast to one identity', () => {
    for (const s of ['Chicken breast', 'chicken breasts', 'Boneless chicken breast', 'chicken breast fillets']) {
      expect(resolveCanonical(s).id).toBe('chicken-breast');
    }
  });
  it('does not treat tomato soup as tomato', () => {
    expect(resolveCanonical('tomato soup').id).not.toBe('tomato');
  });
  it('keeps pepper and chillies apart from capsicum', () => {
    expect(resolveCanonical('pepper').id).toBe('pepper');
    expect(resolveCanonical('Habanero Pepper').id).toBe('chilli');
    expect(resolveCanonical('red pepper').id).toBe('capsicum-red');
  });
  it('reads juice-of measures', () => {
    expect(parseMeasuredIngredient('1', 'Juice of 2', 'Lime')).toMatchObject({ canonicalId: 'lime', quantity: 2, unit: 'each' });
  });
  it('parses free text lines', () => {
    const a = parseIngredientLine('1', '2 cups plain flour, sifted');
    expect(a).toMatchObject({ canonicalId: 'flour', quantity: 500, unit: 'ml', prep: 'sifted' });
    const b = parseIngredientLine('2', '1 large onion, chopped');
    expect(b).toMatchObject({ canonicalId: 'onion', quantity: 1, unit: 'each' });
    const c = parseIngredientLine('3', '½ tsp salt');
    expect(c).toMatchObject({ canonicalId: 'salt', quantity: 2.5, unit: 'ml', noScale: true });
    const d = parseIngredientLine('4', '2 x 400g tins chopped tomatoes');
    expect(d).toMatchObject({ canonicalId: 'tomato-can', quantity: 800, unit: 'g' });
  });
  it('parses separated measures', () => {
    expect(parseMeasuredIngredient('1', '1 lb', 'Ground Beef')).toMatchObject({ canonicalId: 'beef-mince', unit: 'g' });
    expect(parseMeasuredIngredient('2', 'To taste', 'Salt').flags).toContain('no-quantity');
    expect(parseMeasuredIngredient('3', '3 cloves', 'Garlic')).toMatchObject({ canonicalId: 'garlic', quantity: 3, unit: 'each' });
    expect(parseMeasuredIngredient('4', '1 bunch', 'Coriander')).toMatchObject({ unit: 'bunch', flags: ['vague-measure'] });
  });
  it('flags what it cannot identify', () => {
    expect(parseIngredientLine('1', '3 tbsp unobtainium').flags).toContain('unknown-ingredient');
  });
});

describe('servings scaling', () => {
  it('scales proportionally without mutating', () => {
    const base = ing('a', 'flour', 200, 'g');
    const scaled = scaleIngredient(base, 2);
    expect(scaled.quantity).toBe(400);
    expect(base.quantity).toBe(200);
  });
  it('dampens seasoning and leaves vague amounts alone', () => {
    expect(scaleIngredient(ing('s', 'salt', 5, 'ml', { noScale: true }), 2).quantity).toBe(7.5);
    expect(scaleIngredient(ing('t', 'salt', null, 'to taste', { noScale: true }), 3).quantity).toBeNull();
  });
});

describe('pack optimisation', () => {
  const o = (productId: string, qty: number, priceCents: number) => ({ productId, qty, dim: 'g' as const, priceCents, variable: false });
  it('favours the smaller pack for minimum checkout (brief example)', () => {
    const plan = optimisePacks(550, [o('600', 600, 900), o('1kg', 1000, 1300)])!;
    expect(plan.lines).toEqual([{ productId: '600', count: 1, costCents: 900 }]);
    expect(plan.leftoverQty).toBe(50);
  });
  it('combines multiple packs and sizes', () => {
    const plan = optimisePacks(1300, [o('a', 1000, 500), o('b', 300, 200), o('c', 2000, 1100)])!;
    expect(plan.costCents).toBe(700);
    expect(plan.lines.map((l) => l.productId).sort()).toEqual(['a', 'b']);
  });
  it('buys several of one pack', () => {
    const plan = optimisePacks(1100, [o('a', 400, 300)])!;
    expect(plan.lines[0].count).toBe(3);
    expect(plan.leftoverQty).toBe(100);
  });
  it('prices variable weight exactly, without leftovers', () => {
    const plan = optimisePacks(350, [{ productId: 'loose', qty: 0, dim: 'g', priceCents: 410, variable: true }])!;
    expect(plan.costCents).toBe(144);
    expect(plan.lines[0].weightGrams).toBe(350);
    expect(plan.leftoverQty).toBe(0);
  });
  it('returns null with no usable option and an empty plan for no need', () => {
    expect(optimisePacks(100, [])).toBeNull();
    expect(optimisePacks(0, [])?.costCents).toBe(0);
  });
  it('stays in integer cents', () => {
    const plan = optimisePacks(3, [{ productId: 'x', qty: 1, dim: 'each', priceCents: 333, variable: false }])!;
    expect(plan.costCents).toBe(999);
    expect(proportionalCost(100, 300, 999)).toBe(333);
  });
});

describe('price freshness', () => {
  const now = Date.parse('2026-11-02T00:00:00Z');
  it('classifies age and never invents a status', () => {
    expect(priceStatus('2026-11-01T00:00:00Z', now)).toBe('current');
    expect(priceStatus('2026-10-10T00:00:00Z', now)).toBe('recent');
    expect(priceStatus('2026-01-10T00:00:00Z', now)).toBe('stale');
    expect(priceStatus(null, now)).toBe('unknown');
    expect(priceStatus('nope', now)).toBe('unknown');
  });
});

describe('product matching', () => {
  it('matches and rejects by department and exclusions', () => {
    const c = getCanonical('chicken-breast')!;
    expect(scoreProduct(c, product('1', 'chicken breast fresh', 500, 'g', 1000))).not.toBeNull();
    expect(scoreProduct(c, product('2', 'crumbed chicken breast', 500, 'g', 1000))).toBeNull();
    expect(scoreProduct(c, product('3', 'chicken breast', 500, 'g', 1000, { dept: 'Pet' }))).toBeNull();
  });
  it('builds a table that skips unpriced products', () => {
    const table = buildMatchTable([
      product('1', 'chicken breast', 500, 'g', 1000),
      product('2', 'chicken breast large', 1000, 'g', null),
    ]);
    expect(table['chicken-breast'].map((e) => e.productId)).toEqual(['1']);
  });
});

describe('shopping basket', () => {
  const chicken = product('c600', 'chicken 600g', 600, 'g', 900);
  const big = product('c1k', 'chicken 1kg', 1000, 'g', 1300);
  const matches = { 'chicken-breast': [{ productId: 'c600', confidence: 1 }, { productId: 'c1k', confidence: 1 }] };

  it('matches the full worked example from the brief', () => {
    const basket = buildBasket(
      [{ recipeId: 'r', title: 'R', ingredients: [ing('a', 'chicken-breast', 750, 'g')] }],
      ctxOf([chicken, big], matches, { pantry: [{ canonicalId: 'chicken-breast', quantity: 200, dim: 'g' }] }),
    );
    const l = basket.lines[0];
    expect(l.required).toEqual({ quantity: 750, dim: 'g' });
    expect(l.pantryUsed).toBe(200);
    expect(l.toBuy).toBe(550);
    expect(l.plan?.lines[0].productId).toBe('c600');
    expect(l.leftover).toBe(50);
    expect(basket.totals.checkoutCents).toBe(900);
    // 750g at the 600g pack rate of $9 = $11.25 of value, of which 200g is pantry.
    expect(l.valueCents).toBe(1125);
    expect(l.pantrySavingCents).toBe(300);
  });

  it('merges a shared ingredient across recipes into one purchase', () => {
    const onions = product('o', 'onions 1kg', 1000, 'g', 400, { dept: 'Fruit & Veg' });
    const basket = buildBasket(
      [
        { recipeId: 'a', title: 'A', ingredients: [ing('1', 'onion', 2, 'each')] },
        { recipeId: 'b', title: 'B', ingredients: [ing('2', 'onion', 300, 'g')] },
      ],
      ctxOf([onions], { onion: [{ productId: 'o', confidence: 1 }] }),
    );
    expect(basket.lines).toHaveLength(1);
    expect(basket.lines[0].required).toEqual({ quantity: 600, dim: 'g' });
    expect(basket.lines[0].usedBy).toHaveLength(2);
    expect(basket.totals.checkoutCents).toBe(400);
  });

  it('reports incompatible units rather than converting', () => {
    const { merged, unmerged } = mergeAmounts(
      [{ quantity: 100, dim: 'g' }, { quantity: 100, dim: 'ml' }],
      null,
    );
    expect(merged).not.toBeNull();
    expect(unmerged).toHaveLength(1);
  });

  it('flags missing prices and leaves them out of totals', () => {
    const noPrice = product('np', 'mystery', 100, 'g', null);
    const basket = buildBasket(
      [{ recipeId: 'r', title: 'R', ingredients: [ing('a', 'chicken-breast', 100, 'g')] }],
      ctxOf([noPrice], { 'chicken-breast': [{ productId: 'np', confidence: 1 }] }),
    );
    expect(basket.totals.checkoutCents).toBe(0);
    expect(basket.totals.unpricedLines).toBe(1);
    expect(basket.lines[0].needsReview).toBe(true);
  });

  it('flags uncertain amounts', () => {
    const basket = buildBasket(
      [{ recipeId: 'r', title: 'R', ingredients: [ing('a', 'parsley', 1, 'bunch', { flags: ['vague-measure'] })] }],
      ctxOf([product('p', 'parsley', 1, 'each', 300, { dept: 'Fruit & Veg' })], { parsley: [{ productId: 'p', confidence: 1 }] }),
    );
    const l = basket.lines[0];
    expect(l.needsReview).toBe(true);
    expect(l.uncertain[0]).toContain('bunch');
    expect(l.plan?.lines[0].count).toBe(1);
  });

  it('prefers a chosen brand even when dearer, but hand picks still win', () => {
    const cheap = product('a', 'chicken cheap', 1000, 'g', 800, { brand: 'budget' });
    const fancy = product('b', 'chicken fancy', 1000, 'g', 1500, { brand: 'tegel' });
    const m = { 'chicken-breast': [{ productId: 'a', confidence: 1 }, { productId: 'b', confidence: 1 }] };
    const input = [{ recipeId: 'r', title: 'R', ingredients: [ing('c', 'chicken-breast', 500, 'g')] }];
    expect(buildBasket(input, ctxOf([cheap, fancy], m)).lines[0].plan?.lines[0].productId).toBe('a');
    expect(buildBasket(input, ctxOf([cheap, fancy], m, { preferredBrands: ['Tegel'] })).lines[0].plan?.lines[0].productId).toBe('b');
    expect(buildBasket(input, ctxOf([cheap, fancy], m, { preferredBrands: ['nobody'] })).lines[0].plan?.lines[0].productId).toBe('a');
    expect(buildBasket(input, ctxOf([cheap, fancy], m, { preferredBrands: ['Tegel'], overrides: { 'chicken-breast': 'a' } })).lines[0].plan?.lines[0].productId).toBe('a');
  });

  it('honours staples, overrides, and free ingredients', () => {
    const basket = buildBasket(
      [{ recipeId: 'r', title: 'R', ingredients: [ing('s', 'salt', 5, 'ml'), ing('w', 'water', 500, 'ml'), ing('c', 'chicken-breast', 100, 'g')] }],
      ctxOf([chicken, big], matches, { staples: ['salt'], overrides: { 'chicken-breast': 'c1k' } }),
    );
    expect(basket.lines.find((l) => l.canonicalId === 'water')).toBeUndefined();
    expect(basket.lines.find((l) => l.canonicalId === 'salt')?.assumedStaple).toBe(true);
    expect(basket.lines.find((l) => l.canonicalId === 'chicken-breast')?.plan?.lines[0].productId).toBe('c1k');
  });

  it('flags unknown ingredients for manual review', () => {
    const basket = buildBasket([{ recipeId: 'r', title: 'R', ingredients: [ing('x', null, 1, 'each')] }], ctxOf([], {}));
    expect(basket.lines[0].needsReview).toBe(true);
    expect(basket.lines[0].reviewReason).toContain('Unrecognised');
  });
});

const summary = (id: string, over: Partial<RecipeSummary> = {}): RecipeSummary => ({
  id, c: 0, title: id, description: null, completeness: 'complete', servings: 4, servingsVerified: true, totalMinutes: 30, cookMinutes: 20, prepMinutes: 10,
  timeEstimated: false, mealTypes: ['dinner'], cuisine: 'Italian', mainIngredient: 'chicken', tags: [], dietary: [], allergens: [], hasUnknownIngredients: false,
  thermomix: 'none', image: null, sourceName: 's', sourceUrl: null, ingredientIds: ['onion'], valueCents: 1000, checkoutCents: 1500, pricedRatio: 1, specials: 0, ...over,
});

describe('ranking and filters', () => {
  const ctx = {
    pantryIds: new Set<string>(), plannedIds: new Set<string>(), matchedIds: new Set(['onion']), profile: emptyProfile(),
    allergies: [], dislikedIds: new Set<string>(), dietary: [],
  };
  it('excludes allergens and unknowns when allergies are set', () => {
    expect(isExcluded(summary('a', { allergens: ['nuts'] }), { ...ctx, allergies: ['nuts'] })).toBe(true);
    expect(isExcluded(summary('a', { hasUnknownIngredients: true }), { ...ctx, allergies: ['nuts'] })).toBe(true);
    expect(isExcluded(summary('a'), { ...ctx, allergies: ['nuts'] })).toBe(false);
  });
  it('caps cost per serve only where the price is known', () => {
    const c = { ...ctx, maxPerServeCents: 300 };
    expect(isExcluded(summary('a', { valueCents: 2000, servings: 4 }), c)).toBe(true);
    expect(isExcluded(summary('a', { valueCents: 800, servings: 4 }), c)).toBe(false);
    expect(isExcluded(summary('a', { valueCents: null }), c)).toBe(false);
  });
  it('ranks preferred meal types higher', () => {
    const r = summary('a', { mealTypes: ['baking'] });
    expect(scoreRecipe(r, { ...ctx, preferredMeals: ['baking'] })).toBeGreaterThan(scoreRecipe(r, ctx));
  });
  it('is deterministic', () => {
    const list = Array.from({ length: 30 }, (_, i) => summary(`r${i}`, { cuisine: i % 2 ? 'Thai' : 'Italian' }));
    const a = rankDeck(list, ctx).map((r) => r.id);
    const b = rankDeck(list, ctx).map((r) => r.id);
    expect(a).toEqual(b);
  });
  it('learns and uses preferences', () => {
    const thai = summary('t', { cuisine: 'Thai' });
    const profile = learn(emptyProfile(), thai, 1);
    expect(profile.cuisines.Thai).toBe(1);
  });
  it('filters by multiple criteria, unknown prices never pass a price cap', () => {
    const list = [summary('a', { valueCents: 500 }), summary('b', { valueCents: null }), summary('c', { valueCents: 500, tags: ['quick'] })];
    expect(applyFilters(list, { ...emptyFilters(), maxPriceCents: 1000 }).map((r) => r.id)).toEqual(['a', 'c']);
    expect(applyFilters(list, { ...emptyFilters(), maxPriceCents: 1000, tags: ['quick'] }).map((r) => r.id)).toEqual(['c']);
  });
});

describe('meal plan basket totals', () => {
  const recipe = (id: string, ings: RecipeIngredient[]): Recipe => ({
    id, title: id, description: null, completeness: 'complete', servings: 4, servingsVerified: true, prepMinutes: 10, cookMinutes: 20, totalMinutes: 30,
    timeEstimated: false, mealTypes: ['dinner'], cuisine: id, mainIngredient: id, tags: [], dietary: [], allergens: [], hasUnknownIngredients: false, thermomix: 'none',
    image: null, ingredients: ings, steps: [], equipment: [], kidTasks: [], issues: [],
    source: { name: 's', url: null, author: null, license: 'x', licenseUrl: null, rights: 'full-text', provenance: '', importedAt: '' },
  });
  const onions = product('o', 'onions 1kg', 1000, 'g', 400, { dept: 'Fruit & Veg' });
  const steak = product('s', 'steak', 500, 'g', 2000);
  const ctx = ctxOf([onions, steak], { onion: [{ productId: 'o', confidence: 1 }], 'beef-steak': [{ productId: 's', confidence: 1 }] });
  const options = [
    { recipe: recipe('a', [ing('1', 'onion', 300, 'g')]), summary: summary('a', { cuisine: 'A', mainIngredient: 'a' }) },
    { recipe: recipe('b', [ing('1', 'onion', 300, 'g')]), summary: summary('b', { cuisine: 'B', mainIngredient: 'b' }) },
    { recipe: recipe('c', [ing('1', 'beef-steak', 500, 'g')]), summary: summary('c', { cuisine: 'C', mainIngredient: 'c' }) },
  ];
  it('values shared ingredients as one basket', () => {
    const p = proposePlan(options, { strategy: 'budget', meals: 2, servings: 4, budgetCents: null, maxMinutes: null, ratings: {}, seed: 1 }, ctx)!;
    expect(p.picks.map((x) => x.id).sort()).toEqual(['a', 'b']);
    expect(p.checkoutCents).toBe(400);
    expect(p.independentCents).toBe(800);
  });
  it('explains and offers swaps when over budget, and falls back gracefully', () => {
    const p = proposePlan(options, { strategy: 'balanced', meals: 3, servings: 4, budgetCents: 500, maxMinutes: null, ratings: {}, seed: 1 }, ctx)!;
    expect(p.overBudget).toBe(true);
    const few = proposePlan(options, { strategy: 'quick', meals: 10, servings: 4, budgetCents: null, maxMinutes: null, ratings: {}, seed: 1 }, ctx)!;
    expect(few.fellBack).toBe(true);
    expect(few.picks).toHaveLength(3);
  });
  it('is repeatable', () => {
    const c = { strategy: 'surprise' as const, meals: 2, servings: 4, budgetCents: null, maxMinutes: null, ratings: {}, seed: 7 };
    expect(proposePlan(options, c, ctx)!.picks.map((x) => x.id)).toEqual(proposePlan(options, c, ctx)!.picks.map((x) => x.id));
  });
});

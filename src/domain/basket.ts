// The shopping engine: recipes + pantry + products -> combined basket with exact arithmetic.
// One implementation used by Plan, Shop and recipe cost display.
import { getCanonical } from './ingredients';
import { optimisePacks, productOption, proportionalCost, type PackOption, type PackPlan } from './pricing';
import type { Cents, Dim, MatchTable, Product, RecipeIngredient, ShopCategory } from './types';
import { convertDim, normaliseUnit } from './units';

export interface BasketRecipeInput {
  recipeId: string;
  title: string;
  /** Ingredients already scaled to the planned servings. */
  ingredients: RecipeIngredient[];
}

export interface PantryStock {
  canonicalId: string;
  quantity: number | null; // null = staple, assume available
  dim: Dim | null;
}

export interface BasketContext {
  products: Map<string, Product>;
  matches: MatchTable;
  /** canonicalId -> product picked by Ren. Always wins. */
  overrides?: Record<string, string>;
  pantry?: PantryStock[];
  /** Canonical IDs treated as already at home without quantities. */
  staples?: string[];
}

export interface BasketLine {
  key: string;
  canonicalId: string | null;
  name: string;
  category: ShopCategory;
  usedBy: { recipeId: string; title: string }[];
  /** What recipes need. */
  required: { quantity: number; dim: Dim } | null;
  /** Parts that could not be merged numerically, shown verbatim. */
  uncertain: string[];
  /** Available at home. */
  pantryUsed: number;
  assumedStaple: boolean;
  /** What still has to be bought. */
  toBuy: number;
  dim: Dim | null;
  plan: PackPlan | null;
  /** Value of what's actually used, proportional to pack price. */
  valueCents: Cents | null;
  /** Value of the pantry stock used. */
  pantrySavingCents: Cents | null;
  leftover: number;
  confidence: number;
  needsReview: boolean;
  reviewReason: string | null;
  optionalOnly: boolean;
}

export interface BasketTotals {
  checkoutCents: Cents;
  valueCents: Cents;
  pantrySavingCents: Cents;
  leftoverValueCents: Cents;
  pricedLines: number;
  unpricedLines: number;
  reviewLines: number;
}

export interface Basket {
  lines: BasketLine[];
  totals: BasketTotals;
}

interface Accum {
  key: string;
  canonicalId: string | null;
  name: string;
  amounts: { quantity: number; dim: Dim }[];
  uncertain: string[];
  usedBy: Map<string, string>;
  confidence: number;
  allOptional: boolean;
  anyUnknown: boolean;
}

/** Merge several amounts into a single dimension, using only valid conversions. */
export function mergeAmounts(
  amounts: { quantity: number; dim: Dim }[],
  canonicalId: string | null,
): { merged: { quantity: number; dim: Dim } | null; unmerged: { quantity: number; dim: Dim }[] } {
  if (!amounts.length) return { merged: null, unmerged: [] };
  const c = getCanonical(canonicalId);
  const totals = new Map<Dim, number>();
  for (const a of amounts) totals.set(a.dim, (totals.get(a.dim) ?? 0) + a.quantity);
  const ordered = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  // Weight is the most useful common basis when conversion is possible.
  const target = (['g', 'ml', 'each'] as Dim[]).find((d) => ordered.every(([od, q]) => convertDim(q, od, d, c) != null)) ?? ordered[0][0];
  let qty = 0;
  const unmerged: { quantity: number; dim: Dim }[] = [];
  for (const [dim, q] of ordered) {
    const conv = convertDim(q, dim, target, c);
    if (conv == null) unmerged.push({ quantity: q, dim });
    else qty += conv;
  }
  return { merged: { quantity: qty, dim: target }, unmerged };
}

function collect(recipes: BasketRecipeInput[]): Accum[] {
  const map = new Map<string, Accum>();
  for (const r of recipes) {
    for (const ing of r.ingredients) {
      const c = getCanonical(ing.canonicalId);
      if (c?.free) continue;
      const key = ing.canonicalId ?? `text:${ing.name.toLowerCase()}`;
      let a = map.get(key);
      if (!a) {
        a = {
          key,
          canonicalId: ing.canonicalId,
          name: c?.name ?? ing.name,
          amounts: [],
          uncertain: [],
          usedBy: new Map(),
          confidence: 1,
          allOptional: true,
          anyUnknown: false,
        };
        map.set(key, a);
      }
      a.usedBy.set(r.recipeId, r.title);
      a.confidence = Math.min(a.confidence, ing.confidence);
      a.allOptional &&= ing.optional;
      a.anyUnknown ||= !c;
      const n = ing.quantity != null && ing.unit ? normaliseUnit(ing.quantity, ing.unit) : null;
      if (n?.dim) a.amounts.push({ quantity: n.quantity, dim: n.dim });
      else a.uncertain.push(ing.quantity != null ? `${ing.quantity} ${ing.unit ?? ''}`.trim() : ing.unit ?? 'amount not stated');
    }
  }
  return [...map.values()];
}

/** Candidate products convertible to `dim`, as options expressed in that dim. */
function optionsFor(
  canonicalId: string | null,
  dim: Dim | null,
  ctx: BasketContext,
): { options: PackOption[]; confidence: number; forcedId: string | null } {
  if (!canonicalId) return { options: [], confidence: 0, forcedId: null };
  const c = getCanonical(canonicalId);
  const override = ctx.overrides?.[canonicalId];
  const entries = override
    ? [{ productId: override, confidence: 1 }]
    : ctx.matches[canonicalId] ?? [];
  const opts: PackOption[] = [];
  for (const e of entries) {
    const p = ctx.products.get(e.productId);
    if (!p) continue;
    const o = productOption(p);
    if (!o) continue;
    if (!dim || o.dim === dim) {
      opts.push(o);
      continue;
    }
    if (o.variable) {
      // A price-per-kg item can satisfy "each" or ml only through ingredient conversions.
      opts.push(o);
      continue;
    }
    const shelfItem = o.dim === 'each' && c?.shelfEachGrams ? { ...c, eachGrams: c.shelfEachGrams } : c;
    const conv = convertDim(o.qty, o.dim, dim, shelfItem);
    if (conv != null) opts.push({ ...o, qty: conv, dim });
  }
  return { options: opts, confidence: entries[0]?.confidence ?? 0, forcedId: override ?? null };
}

export function buildBasket(recipes: BasketRecipeInput[], ctx: BasketContext): Basket {
  const lines: BasketLine[] = [];
  const staples = new Set(ctx.staples ?? []);

  for (const a of collect(recipes)) {
    const c = getCanonical(a.canonicalId);
    const { merged, unmerged } = mergeAmounts(a.amounts, a.canonicalId);
    const uncertain = [...a.uncertain, ...unmerged.map((u) => `${+u.quantity.toFixed(1)} ${u.dim}`)];
    const dim = merged?.dim ?? null;
    let need = merged?.quantity ?? 0;

    // Pantry deduction.
    let pantryUsed = 0;
    let assumedStaple = a.canonicalId ? staples.has(a.canonicalId) : false;
    for (const s of ctx.pantry ?? []) {
      if (s.canonicalId !== a.canonicalId) continue;
      if (s.quantity == null) {
        assumedStaple = true;
        continue;
      }
      if (dim && s.dim) {
        const conv = convertDim(s.quantity, s.dim, dim, c);
        if (conv != null) {
          const used = Math.min(conv, need);
          pantryUsed += used;
          need -= used;
        }
      } else if (!merged && s.quantity > 0) {
        // Vague requirement but we hold some: count it as covered, not as a measured deduction.
        assumedStaple = true;
      }
    }
    if (assumedStaple) {
      pantryUsed = merged?.quantity ?? 0;
      need = 0;
    }

    const { options, confidence } = optionsFor(a.canonicalId, dim, ctx);
    let plan: PackPlan | null = null;
    let reviewReason: string | null = null;

    const vaguePurchase = !merged && !assumedStaple && uncertain.length > 0;
    if (need > 1e-9 && dim) {
      const fixedOrVar = options.map((o) => {
        if (!o.variable || dim === 'g') return o;
        return null;
      });
      const usable = fixedOrVar.filter(Boolean) as PackOption[];
      plan = optimisePacks(need, usable);
      if (!plan && options.length) {
        // Variable-weight item with a non-weight requirement: convert requirement to grams.
        const grams = convertDim(need, dim, 'g', c);
        if (grams != null) plan = optimisePacks(grams, options.filter((o) => o.variable));
      }
    } else if (vaguePurchase && options.length) {
      // A vague amount: suggest one smallest pack, and flag it.
      const fixed = [...options].filter((o) => !o.variable).sort((x, y) => x.priceCents - y.priceCents)[0];
      if (fixed) {
        plan = { lines: [{ productId: fixed.productId, count: 1, costCents: fixed.priceCents }], costCents: fixed.priceCents, boughtQty: fixed.qty, leftoverQty: 0 };
      }
    }

    // Ren picked this product by hand: honour it even when sizes can't be compared.
    const handPicked = ctx.overrides?.[a.key] ? ctx.products.get(ctx.overrides[a.key]) : undefined;
    if (!plan && !assumedStaple && handPicked?.priceCents != null && (need > 1e-9 || uncertain.length)) {
      plan = { lines: [{ productId: handPicked.id, count: 1, costCents: handPicked.priceCents }], costCents: handPicked.priceCents, boughtQty: 0, leftoverQty: 0 };
    }

    if (handPicked && plan) reviewReason = null;
    else if (!a.canonicalId) reviewReason = 'Unrecognised ingredient: pick a product by hand.';
    else if (!options.length && !assumedStaple) reviewReason = 'No matching product with a usable price in the catalogue.';
    else if (uncertain.length && !assumedStaple) reviewReason = `Amount needs a look: ${uncertain.join(', ')}.`;
    else if (confidence > 0 && confidence < 0.7) reviewReason = 'Uncertain product match: please confirm.';
    if (need > 1e-9 && !plan && !reviewReason) reviewReason = 'Could not convert this amount to a product size.';

    // Value of the ingredient actually used: pro-rata against the purchased product.
    let valueCents: Cents | null = null;
    let pantrySavingCents: Cents | null = null;
    const pricingBasis = plan?.lines[0] ?? null;
    const unit = pricingBasis ? unitCostFromPlan(plan!) : cheapestUnitCost(options);
    if (merged && unit != null) {
      valueCents = Math.round(merged.quantity * unit);
      pantrySavingCents = Math.round(pantryUsed * unit);
    }

    lines.push({
      key: a.key,
      canonicalId: a.canonicalId,
      name: a.name,
      category: c?.category ?? 'other',
      usedBy: [...a.usedBy.entries()].map(([recipeId, title]) => ({ recipeId, title })),
      required: merged,
      uncertain,
      pantryUsed,
      assumedStaple,
      toBuy: Math.max(0, need),
      dim,
      plan,
      valueCents,
      pantrySavingCents,
      leftover: plan?.leftoverQty ?? 0,
      confidence: Math.min(a.confidence, confidence || a.confidence),
      needsReview: reviewReason != null,
      reviewReason,
      optionalOnly: a.allOptional,
    });
  }

  lines.sort((x, y) => x.category.localeCompare(y.category) || x.name.localeCompare(y.name));
  return { lines, totals: basketTotals(lines) };
}

function unitCostFromPlan(plan: PackPlan): number | null {
  const qty = plan.boughtQty;
  if (qty <= 0) return null;
  return plan.costCents / qty;
}

function cheapestUnitCost(options: PackOption[]): number | null {
  let best: number | null = null;
  for (const o of options) {
    const u = o.variable ? o.priceCents / 1000 : o.qty > 0 ? o.priceCents / o.qty : null;
    if (u != null && (best == null || u < best)) best = u;
  }
  return best;
}

export function basketTotals(lines: BasketLine[]): BasketTotals {
  const t: BasketTotals = { checkoutCents: 0, valueCents: 0, pantrySavingCents: 0, leftoverValueCents: 0, pricedLines: 0, unpricedLines: 0, reviewLines: 0 };
  for (const l of lines) {
    if (l.needsReview) t.reviewLines++;
    if (l.plan) {
      t.pricedLines++;
      t.checkoutCents += l.plan.costCents;
      if (l.leftover > 0 && l.plan.boughtQty > 0) {
        t.leftoverValueCents += proportionalCost(l.leftover, l.plan.boughtQty, l.plan.costCents);
      }
    } else if (l.toBuy > 0 || (!l.assumedStaple && l.uncertain.length)) {
      t.unpricedLines++;
    }
    if (l.valueCents != null) t.valueCents += l.valueCents;
    if (l.pantrySavingCents != null) t.pantrySavingCents += l.pantrySavingCents;
  }
  return t;
}

/** Other products that could fill a line, ranked. */
export function alternativesFor(canonicalId: string | null, ctx: BasketContext): Product[] {
  if (!canonicalId) return [];
  return (ctx.matches[canonicalId] ?? [])
    .map((e) => ctx.products.get(e.productId))
    .filter((p): p is Product => Boolean(p));
}

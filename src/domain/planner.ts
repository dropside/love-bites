// Deterministic week planner. Evaluates a whole week as one basket rather than summing meal costs.
import { buildBasket, type BasketContext, type BasketRecipeInput } from './basket';
import { hash01 } from './ranking';
import type { Recipe, RecipeSummary } from './types';
import { scaleIngredient } from './ingredients';

export type PlanStrategy = 'balanced' | 'budget' | 'quick' | 'pantry' | 'favourites' | 'surprise';

export interface PlannerConstraints {
  strategy: PlanStrategy;
  meals: number;
  servings: number;
  budgetCents: number | null;
  maxMinutes: number | null;
  ratings: Record<string, number>;
  seed: number;
}

export interface PlannedOption {
  summary: RecipeSummary;
  recipe: Recipe;
}

export interface PlanProposal {
  picks: RecipeSummary[];
  checkoutCents: number;
  independentCents: number;
  sharedIngredients: { name: string; count: number }[];
  pantrySavingCents: number;
  overBudget: boolean;
  fellBack: boolean;
  explanations: string[];
  swaps: { out: RecipeSummary; in: RecipeSummary; savesCents: number }[];
}

const toInput = (o: PlannedOption, servings: number): BasketRecipeInput => {
  const f = servings / (o.recipe.servings || servings);
  return { recipeId: o.recipe.id, title: o.recipe.title, ingredients: o.recipe.ingredients.map((i) => scaleIngredient(i, f)) };
};

function score(o: PlannedOption[], c: PlannerConstraints, ctx: BasketContext): { value: number; checkout: number; saving: number } {
  const basket = buildBasket(o.map((x) => toInput(x, c.servings)), ctx);
  const t = basket.totals;
  const lines = basket.lines;
  const shared = lines.filter((l) => l.usedBy.length > 1 && !l.assumedStaple).length;
  const cuisines = new Set(o.map((x) => x.summary.cuisine));
  const mains = new Set(o.map((x) => x.summary.mainIngredient));
  const minutes = o.reduce((n, x) => n + (x.summary.totalMinutes ?? 45), 0);
  const ratingSum = o.reduce((n, x) => n + (c.ratings[x.summary.id] ?? 3), 0);

  // Lower is better.
  const weights: Record<PlanStrategy, { cost: number; time: number; pantry: number; rate: number; waste: number }> = {
    balanced: { cost: 1, time: 0.5, pantry: 1, rate: 80, waste: 0.4 },
    budget: { cost: 3, time: 0.1, pantry: 1.5, rate: 20, waste: 0.8 },
    quick: { cost: 0.5, time: 6, pantry: 0.5, rate: 20, waste: 0.2 },
    pantry: { cost: 0.6, time: 0.2, pantry: 5, rate: 30, waste: 0.8 },
    favourites: { cost: 0.4, time: 0.1, pantry: 0.4, rate: 500, waste: 0.1 },
    surprise: { cost: 0.5, time: 0.1, pantry: 0.4, rate: 20, waste: 0.2 },
  };
  const w = weights[c.strategy];
  let value = t.checkoutCents * w.cost + minutes * w.time * 10 - t.pantrySavingCents * w.pantry - ratingSum * w.rate + t.leftoverValueCents * w.waste;
  value -= shared * 60; // reward real ingredient reuse
  value += (o.length - cuisines.size) * 120 + (o.length - mains.size) * 200; // variety
  if (c.budgetCents != null && t.checkoutCents > c.budgetCents) value += (t.checkoutCents - c.budgetCents) * 4;
  if (c.strategy === 'surprise') value += o.reduce((n, x) => n + hash01(x.summary.id, c.seed) * 1500, 0);
  return { value, checkout: t.checkoutCents, saving: t.pantrySavingCents };
}

/**
 * Greedy build followed by swap local search. Same inputs always yield the same plan.
 * Falls back to fewer constraints rather than returning nothing.
 */
export function proposePlan(options: PlannedOption[], c: PlannerConstraints, ctx: BasketContext): PlanProposal | null {
  let pool = options.filter((o) => o.recipe.ingredients.length > 0);
  if (!pool.length) return null;
  let fellBack = false;
  if (c.maxMinutes != null) {
    const within = pool.filter((o) => (o.summary.totalMinutes ?? Infinity) <= c.maxMinutes!);
    if (within.length >= c.meals) pool = within;
    else fellBack = true;
  }
  if (c.strategy === 'quick') {
    const quick = pool.filter((o) => (o.summary.totalMinutes ?? 60) <= 40);
    if (quick.length >= c.meals) pool = quick;
  }
  pool = pool.slice().sort((a, b) => a.summary.id.localeCompare(b.summary.id));
  const meals = Math.min(c.meals, pool.length);
  if (meals < c.meals) fellBack = true;

  const chosen: PlannedOption[] = [];
  for (let i = 0; i < meals; i++) {
    let best: PlannedOption | null = null;
    let bestV = Infinity;
    for (const o of pool) {
      if (chosen.includes(o)) continue;
      const v = score([...chosen, o], c, ctx).value + hash01(o.summary.id, c.seed) * 40;
      if (v < bestV) {
        bestV = v;
        best = o;
      }
    }
    if (best) chosen.push(best);
  }

  // Bounded local improvement: try replacing each meal.
  let current = score(chosen, c, ctx).value;
  for (let round = 0; round < 2; round++) {
    let improved = false;
    for (let i = 0; i < chosen.length; i++) {
      for (const o of pool) {
        if (chosen.includes(o)) continue;
        const trial = chosen.slice();
        trial[i] = o;
        const v = score(trial, c, ctx).value + 0;
        if (v < current - 1) {
          chosen[i] = o;
          current = v;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }

  const inputs = chosen.map((o) => toInput(o, c.servings));
  const basket = buildBasket(inputs, ctx);
  const independent = chosen.reduce((sum, o) => sum + buildBasket([toInput(o, c.servings)], ctx).totals.checkoutCents, 0);
  const shared = basket.lines
    .filter((l) => l.usedBy.length > 1 && !l.assumedStaple && !['salt', 'pepper', 'veg-oil', 'olive-oil'].includes(l.canonicalId ?? ''))
    .sort((a, b) => b.usedBy.length - a.usedBy.length)
    .map((l) => ({ name: l.name, count: l.usedBy.length }));

  const explanations: string[] = [];
  if (shared.length >= 2) {
    const names = shared.slice(0, 3).map((s) => s.name.toLowerCase());
    explanations.push(`These meals share ${names.slice(0, -1).join(', ')}${names.length > 1 ? ' and ' : ''}${names.at(-1)}.`);
  }
  if (basket.totals.pantrySavingCents >= 100) {
    explanations.push(`Using your pantry saves approximately $${(basket.totals.pantrySavingCents / 100).toFixed(0)}.`);
  }
  if (independent - basket.totals.checkoutCents >= 100) {
    explanations.push(`Shopping them together costs about $${((independent - basket.totals.checkoutCents) / 100).toFixed(0)} less than buying for each meal separately.`);
  }
  if (fellBack) explanations.push("Not enough recipes fit every constraint, so I relaxed some. Save more recipes for a tighter fit.");

  const overBudget = c.budgetCents != null && basket.totals.checkoutCents > c.budgetCents;
  const swaps: PlanProposal['swaps'] = [];
  if (overBudget) {
    for (const o of chosen) {
      let bestAlt: PlannedOption | null = null;
      let bestCost = basket.totals.checkoutCents;
      for (const alt of pool) {
        if (chosen.includes(alt)) continue;
        const cost = score(chosen.map((x) => (x === o ? alt : x)), c, ctx).checkout;
        if (cost < bestCost) {
          bestCost = cost;
          bestAlt = alt;
        }
      }
      if (bestAlt) swaps.push({ out: o.summary, in: bestAlt.summary, savesCents: basket.totals.checkoutCents - bestCost });
    }
    swaps.sort((a, b) => b.savesCents - a.savesCents);
    if (swaps[0]) explanations.push(`Swap ${swaps[0].out.title} for ${swaps[0].in.title} to cut the shop by about $${(swaps[0].savesCents / 100).toFixed(0)}.`);
  }

  return {
    picks: chosen.map((o) => o.summary),
    checkoutCents: basket.totals.checkoutCents,
    independentCents: independent,
    sharedIngredients: shared,
    pantrySavingCents: basket.totals.pantrySavingCents,
    overBudget,
    fellBack,
    explanations,
    swaps: swaps.slice(0, 3),
  };
}

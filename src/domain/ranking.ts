// Discovery ranking: deterministic weighted scoring with exclusions, a variety penalty and exploration.
import type { Allergen, RecipeSummary } from './types';

export interface RankWeights {
  availability: number;
  cost: number;
  preference: number;
  time: number;
  overlap: number;
}

export const DEFAULT_WEIGHTS: RankWeights = { availability: 0.35, cost: 0.25, preference: 0.2, time: 0.1, overlap: 0.1 };

export interface TasteProfile {
  ingredients: Record<string, number>;
  cuisines: Record<string, number>;
  mealTypes: Record<string, number>;
  tags: Record<string, number>;
  minutes: number[];
}

export const emptyProfile = (): TasteProfile => ({ ingredients: {}, cuisines: {}, mealTypes: {}, tags: {}, minutes: [] });

/** Learn from a swipe. love +1, pass −1, save +0.4. */
export function learn(profile: TasteProfile, r: RecipeSummary, signal: number): TasteProfile {
  const bump = (m: Record<string, number>, k: string | null | undefined, by = signal) => {
    if (k) m[k] = +((m[k] ?? 0) + by).toFixed(3);
  };
  const next: TasteProfile = {
    ingredients: { ...profile.ingredients },
    cuisines: { ...profile.cuisines },
    mealTypes: { ...profile.mealTypes },
    tags: { ...profile.tags },
    minutes: [...profile.minutes],
  };
  for (const i of r.ingredientIds) bump(next.ingredients, i, signal * 0.3);
  bump(next.cuisines, r.cuisine);
  for (const m of r.mealTypes) bump(next.mealTypes, m);
  for (const t of r.tags) bump(next.tags, t, signal * 0.5);
  if (signal > 0 && r.totalMinutes) next.minutes = [...next.minutes.slice(-29), r.totalMinutes];
  return next;
}

/** Rebuild a profile from swipe history, so undo is exact. */
export function profileFrom(swipes: { recipeId: string; action: string }[], byId: Map<string, RecipeSummary>): TasteProfile {
  let p = emptyProfile();
  for (const s of swipes) {
    const r = byId.get(s.recipeId);
    if (!r) continue;
    const signal = s.action === 'love' ? 1 : s.action === 'pass' ? -1 : s.action === 'save' ? 0.4 : 0;
    if (signal) p = learn(p, r, signal);
  }
  return p;
}

export interface RankContext {
  pantryIds: Set<string>;
  plannedIds: Set<string>;
  matchedIds: Set<string>;
  profile: TasteProfile;
  weights?: RankWeights;
  allergies: Allergen[];
  dislikedIds: Set<string>;
  dietary: string[];
  /** Hard cap where a price is known. Unknown prices stay in, and are never treated as cheap. */
  maxPerServeCents?: number | null;
  preferredMeals?: string[];
  seed?: number;
}

/** Hard exclusions. Allergies and dietary needs are never just a score penalty. */
export function isExcluded(r: RecipeSummary, ctx: Pick<RankContext, 'allergies' | 'dislikedIds' | 'dietary' | 'maxPerServeCents'>): boolean {
  if (ctx.maxPerServeCents != null && r.valueCents != null && r.valueCents / r.servings > ctx.maxPerServeCents) return true;
  if (ctx.allergies.length) {
    if (r.allergens.some((a) => ctx.allergies.includes(a))) return true;
    // Can't vouch for what we can't identify.
    if (r.hasUnknownIngredients) return true;
  }
  if (r.ingredientIds.some((i) => ctx.dislikedIds.has(i))) return true;
  if (ctx.dietary.length) {
    if (r.hasUnknownIngredients) return true;
    if (!ctx.dietary.every((d) => r.dietary.includes(d))) return true;
  }
  return false;
}

export function availabilityScore(r: RecipeSummary, ctx: Pick<RankContext, 'pantryIds' | 'matchedIds'>): number {
  if (!r.ingredientIds.length) return 0.3;
  let n = 0;
  for (const id of r.ingredientIds) if (ctx.pantryIds.has(id) || ctx.matchedIds.has(id)) n++;
  return n / r.ingredientIds.length;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export function scoreRecipe(r: RecipeSummary, ctx: RankContext): number {
  const w = ctx.weights ?? DEFAULT_WEIGHTS;
  const avail = availabilityScore(r, ctx);
  const perServe = r.valueCents != null && r.servings ? r.valueCents / r.servings : null;
  // $2 a serve is great, $15 isn't. Unknown price stays neutral, never treated as cheap.
  const cost = perServe == null ? 0.4 : clamp01(1 - (perServe - 200) / 1300);
  const p = ctx.profile;
  let pref = 0;
  pref += (p.cuisines[r.cuisine ?? ''] ?? 0) * 0.3;
  for (const m of r.mealTypes) pref += (p.mealTypes[m] ?? 0) * 0.15;
  for (const t of r.tags) pref += (p.tags[t] ?? 0) * 0.1;
  for (const i of r.ingredientIds) pref += (p.ingredients[i] ?? 0) * 0.05;
  if (ctx.preferredMeals?.some((m) => r.mealTypes.includes(m))) pref += 0.6;
  const prefScore = clamp01(0.5 + pref / 4);
  const avgMin = p.minutes.length ? p.minutes.reduce((a, b) => a + b, 0) / p.minutes.length : 40;
  const time = r.totalMinutes == null ? 0.4 : clamp01(1 - Math.max(0, r.totalMinutes - avgMin) / 90);
  let overlap = 0;
  for (const id of r.ingredientIds) if (ctx.plannedIds.has(id) || ctx.pantryIds.has(id)) overlap++;
  const overlapScore = r.ingredientIds.length ? overlap / r.ingredientIds.length : 0;
  const complete = r.completeness === 'complete' ? 0.1 : r.completeness === 'discovery-only' ? -0.05 : 0;
  return w.availability * avail + w.cost * cost + w.preference * prefScore + w.time * time + w.overlap * overlapScore + complete;
}

/** Small stable pseudo-random from an ID, so the deck order is stable across reloads. */
export function hash01(s: string, seed = 0): number {
  let h = 2166136261 ^ seed;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

/** Rank with exploration + a similarity penalty so the deck doesn't repeat itself. */
export function rankDeck(candidates: RecipeSummary[], ctx: RankContext): RecipeSummary[] {
  const seed = ctx.seed ?? 1;
  const scored = candidates
    .filter((r) => !isExcluded(r, ctx))
    .map((r) => ({ r, s: scoreRecipe(r, ctx) + hash01(r.id, seed) * 0.22 }))
    .sort((a, b) => b.s - a.s);
  // Greedy re-order: penalise matching what we've just shown.
  const out: RecipeSummary[] = [];
  const recentCuisine: (string | null)[] = [];
  const recentMain: (string | null)[] = [];
  const pool = scored.slice();
  while (pool.length) {
    const window = pool.slice(0, 25);
    let bestIdx = 0;
    let best = -Infinity;
    window.forEach((c, i) => {
      let s = c.s;
      if (c.r.cuisine && recentCuisine.includes(c.r.cuisine)) s -= 0.07;
      if (c.r.mainIngredient && recentMain.includes(c.r.mainIngredient)) s -= 0.1;
      if (s > best) {
        best = s;
        bestIdx = i;
      }
    });
    const [chosen] = pool.splice(bestIdx, 1);
    out.push(chosen.r);
    recentCuisine.push(chosen.r.cuisine);
    recentMain.push(chosen.r.mainIngredient);
    if (recentCuisine.length > 3) recentCuisine.shift();
    if (recentMain.length > 3) recentMain.shift();
  }
  return out;
}

export interface DiscoverFilters {
  query: string;
  mainIngredient: string | null;
  mealType: string | null;
  cuisine: string | null;
  maxTotal: number | null;
  maxCook: number | null;
  maxPrep: number | null;
  maxPriceCents: number | null;
  maxPerServeCents: number | null;
  servings: number | null;
  thermomix: boolean;
  dietary: string[];
  tags: string[];
  onSpecial: boolean;
  fullRecipesOnly: boolean;
  sort: 'best' | 'cheapest' | 'quickest' | 'az';
}

export const emptyFilters = (): DiscoverFilters => ({
  query: '', mainIngredient: null, mealType: null, cuisine: null, maxTotal: null, maxCook: null, maxPrep: null,
  maxPriceCents: null, maxPerServeCents: null, servings: null, thermomix: false, dietary: [], tags: [], onSpecial: false,
  fullRecipesOnly: false, sort: 'best',
});

export function activeFilterCount(f: DiscoverFilters): number {
  const e = emptyFilters();
  let n = 0;
  for (const k of Object.keys(e) as (keyof DiscoverFilters)[]) {
    if (k === 'sort') continue;
    const v = f[k];
    if (Array.isArray(v) ? v.length : v !== e[k]) n++;
  }
  return n;
}

export function applyFilters(list: RecipeSummary[], f: DiscoverFilters): RecipeSummary[] {
  const q = f.query.trim().toLowerCase();
  const terms = q ? q.split(/\s+/) : [];
  return list.filter((r) => {
    if (terms.length) {
      const hay = `${r.title} ${r.description ?? ''} ${r.cuisine ?? ''} ${r.ingredientIds.join(' ').replaceAll('-', ' ')} ${r.tags.join(' ')}`.toLowerCase();
      if (!terms.every((t) => hay.includes(t))) return false;
    }
    if (f.mainIngredient && r.mainIngredient !== f.mainIngredient) return false;
    if (f.mealType && !r.mealTypes.includes(f.mealType)) return false;
    if (f.cuisine && r.cuisine !== f.cuisine) return false;
    if (f.maxTotal != null && (r.totalMinutes == null || r.totalMinutes > f.maxTotal)) return false;
    if (f.maxCook != null && (r.cookMinutes == null || r.cookMinutes > f.maxCook)) return false;
    if (f.maxPrep != null && (r.prepMinutes == null || r.prepMinutes > f.maxPrep)) return false;
    if (f.maxPriceCents != null && (r.valueCents == null || r.valueCents > f.maxPriceCents)) return false;
    if (f.maxPerServeCents != null && (r.valueCents == null || r.valueCents / r.servings > f.maxPerServeCents)) return false;
    if (f.servings != null && r.servings !== f.servings) return false;
    if (f.thermomix && r.thermomix === 'none') return false;
    if (f.dietary.length && (r.hasUnknownIngredients || !f.dietary.every((d) => r.dietary.includes(d)))) return false;
    if (f.tags.length && !f.tags.every((t) => r.tags.includes(t))) return false;
    if (f.onSpecial && !r.specials) return false;
    if (f.fullRecipesOnly && r.completeness !== 'complete') return false;
    return true;
  });
}

export function applySort(list: RecipeSummary[], sort: DiscoverFilters['sort']): RecipeSummary[] {
  if (sort === 'best') return list;
  const s = list.slice();
  if (sort === 'cheapest') s.sort((a, b) => (a.valueCents ?? Infinity) / a.servings - (b.valueCents ?? Infinity) / b.servings);
  else if (sort === 'quickest') s.sort((a, b) => (a.totalMinutes ?? Infinity) - (b.totalMinutes ?? Infinity));
  else s.sort((a, b) => a.title.localeCompare(b.title));
  return s;
}

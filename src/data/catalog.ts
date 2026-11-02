// Static catalogue access. Versioned and read-only: replaced by deployments without touching personal data.
import { CANONICAL_INGREDIENTS } from '../domain/canonicalData';
import type { CatalogManifest, MatchTable, Product, Recipe, RecipeSummary } from '../domain/types';
import { db } from '../state/db';
import { unpackProducts, type PackedProduct } from './productCodec';

const base = import.meta.env.BASE_URL;
const fetchJson = async <T,>(p: string): Promise<T> => {
  const res = await fetch(`${base}data/${p}`);
  if (!res.ok) throw new Error(`Could not load ${p} (${res.status})`);
  return (await res.json()) as T;
};

let index: Promise<RecipeSummary[]> | null = null;
export const loadIndex = () => (index ??= fetchJson<RecipeSummary[]>('recipes-index.json'));
export const loadManifest = () => fetchJson<CatalogManifest>('manifest.json');
export const loadReport = () => fetchJson<Record<string, unknown>>('report.json');

export interface ProductData { products: Map<string, Product>; list: Product[]; matches: MatchTable; }
let productData: Promise<ProductData> | null = null;
export function loadProducts(): Promise<ProductData> {
  return (productData ??= (async () => {
    const [rows, matches] = await Promise.all([fetchJson<PackedProduct[]>('products.json'), fetchJson<MatchTable>('matches.json')]);
    const list = unpackProducts(rows);
    return { list, products: new Map(list.map((p) => [p.id, p])), matches };
  })());
}

let matchIds: Promise<Set<string>> | null = null;
/** Just the set of ingredients with a product match: much lighter than the product file. */
export const loadMatchIds = () => (matchIds ??= fetchJson<MatchTable>('matches.json').then((m) => new Set(Object.keys(m))));

const chunks = new Map<number, Promise<Recipe[]>>();
const loadChunk = (n: number) => {
  let c = chunks.get(n);
  if (!c) {
    c = fetchJson<Recipe[]>(`recipes/chunk-${n}.json`);
    chunks.set(n, c);
  }
  return c;
};

export async function getRecipe(id: string): Promise<Recipe | null> {
  if (id.startsWith('user-')) return (await db.userRecipes.get(id)) ?? null;
  const entry = (await loadIndex()).find((r) => r.id === id);
  if (!entry) return null;
  return (await loadChunk(entry.c)).find((r) => r.id === id) ?? null;
}

export async function getRecipes(ids: string[]): Promise<Recipe[]> {
  const found = await Promise.all([...new Set(ids)].map(getRecipe));
  return found.filter((r): r is Recipe => Boolean(r));
}

export function summaryOf(r: Recipe): RecipeSummary {
  return {
    id: r.id, c: -1, title: r.title, description: r.description, completeness: r.completeness, servings: r.servings, servingsVerified: r.servingsVerified,
    totalMinutes: r.totalMinutes, cookMinutes: r.cookMinutes, prepMinutes: r.prepMinutes, timeEstimated: r.timeEstimated, mealTypes: r.mealTypes, cuisine: r.cuisine,
    mainIngredient: r.mainIngredient, tags: r.tags, dietary: r.dietary, allergens: r.allergens, hasUnknownIngredients: r.hasUnknownIngredients, thermomix: r.thermomix,
    image: r.image?.url ?? null, sourceName: r.source.name, sourceUrl: r.source.url,
    ingredientIds: [...new Set(r.ingredients.map((i) => i.canonicalId).filter((x): x is string => Boolean(x)))],
    valueCents: null, checkoutCents: null, pricedRatio: 0, specials: 0,
  };
}

export const defaultStapleIds = () => CANONICAL_INGREDIENTS.filter((c) => c.staple).map((c) => c.id);

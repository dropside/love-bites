// React bindings for data: single source of truth for basket and pantry math on every screen.
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { buildBasket, type Basket, type BasketContext, type BasketRecipeInput } from '../domain/basket';
import { scaleIngredient } from '../domain/ingredients';
import type { Recipe, RecipeSummary } from '../domain/types';
import { defaultStapleIds, getRecipe, getRecipes, loadIndex, loadProducts, summaryOf, type ProductData } from '../data/catalog';
import { db, defaultHousehold, type Household, type PantryRow } from './db';

export function useHousehold(): Household {
  const row = useLiveQuery(() => db.settings.get('household'), []);
  return useMemo(() => ({ ...defaultHousehold(defaultStapleIds()), ...((row?.value as Partial<Household>) ?? {}) }), [row]);
}

export function useCatalogIndex() {
  const [catalog, setCatalog] = useState<RecipeSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadIndex().then(setCatalog).catch((e: Error) => setError(e.message));
  }, []);
  const user = useLiveQuery(() => db.userRecipes.toArray(), []);
  const all = useMemo(() => (catalog ? [...(user ?? []).map(summaryOf), ...catalog] : null), [catalog, user]);
  return { index: all, error };
}

export function useProducts() {
  const [data, setData] = useState<ProductData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadProducts().then(setData).catch((e: Error) => setError(e.message));
  }, []);
  return { data, error };
}

export function useRecipe(id: string | undefined) {
  const [state, setState] = useState<{ id?: string; recipe: Recipe | null; loading: boolean }>({ recipe: null, loading: true });
  const userVersion = useLiveQuery(() => (id?.startsWith('user-') ? db.userRecipes.get(id).then((r) => r?.updatedAt ?? 0) : 0), [id]);
  useEffect(() => {
    let live = true;
    if (!id) return;
    getRecipe(id).then((recipe) => live && setState({ id, recipe, loading: false })).catch(() => live && setState({ id, recipe: null, loading: false }));
    return () => {
      live = false;
    };
  }, [id, userVersion]);
  return state.id === id ? state : { recipe: null, loading: true };
}

export interface BasketEntry { recipeId: string; servings: number; }

/** The full basket for a set of planned or added recipes, with pantry, staples and product choices applied. */
export function useBasket(entries: BasketEntry[] | undefined) {
  const { data } = useProducts();
  const household = useHousehold();
  const pantry = useLiveQuery(() => db.pantry.toArray(), []);
  const choices = useLiveQuery(() => db.productChoices.toArray(), []);
  const [recipes, setRecipes] = useState<Map<string, Recipe> | null>(null);
  const key = (entries ?? []).map((e) => e.recipeId).sort().join('|');

  useEffect(() => {
    let live = true;
    if (!entries) return;
    getRecipes(entries.map((e) => e.recipeId)).then((rs) => live && setRecipes(new Map(rs.map((r) => [r.id, r]))));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const ctx = useMemo<BasketContext | null>(() => {
    if (!data || !pantry || !choices) return null;
    return {
      products: data.products,
      matches: data.matches,
      overrides: Object.fromEntries(choices.map((c) => [c.canonicalId, c.productId])),
      pantry: pantry.filter((p): p is PantryRow & { canonicalId: string } => Boolean(p.canonicalId)).map((p) => ({ canonicalId: p.canonicalId, quantity: p.staple ? null : p.quantity, dim: p.dim })),
      staples: household.stapleIds,
    };
  }, [data, pantry, choices, household.stapleIds]);

  const basket = useMemo<Basket | null>(() => {
    if (!ctx || !recipes || !entries) return null;
    return buildBasket(toBasketInputs(entries, recipes), ctx);
  }, [ctx, recipes, entries]);

  return { basket, ctx, recipes, data };
}

export function toBasketInputs(entries: BasketEntry[], recipes: Map<string, Recipe>): BasketRecipeInput[] {
  const merged: BasketRecipeInput[] = [];
  entries.forEach((e, i) => {
    const r = recipes.get(e.recipeId);
    if (!r || !r.ingredients.length) return;
    const factor = e.servings / (r.servings || e.servings);
    merged.push({ recipeId: `${r.id}#${i}`, title: r.title, ingredients: r.ingredients.map((x) => scaleIngredient(x, factor)) });
  });
  return merged;
}

export function useOnline() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

/** Keep the screen awake while mounted, where the browser supports it. */
export function useWakeLock(enabled = true) {
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request('screen');
        if (cancelled) {
          void lock.release();
          return;
        }
        setActive(true);
        lock.addEventListener('release', () => setActive(false));
      } catch {
        setActive(false);
      }
    };
    void acquire();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release();
    };
  }, [enabled]);
  return active;
}

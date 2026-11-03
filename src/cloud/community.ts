// Recipes trusted contributors (Ren and Katie) add to Love Bites for everyone.
// Only people on the contributors list can add them: enforced by row-level security, not by this code.
import { useEffect, useState } from 'react';
import type { Recipe } from '../domain/types';
import { cloud, liveUserId } from './client';

export interface CommunityRow { id: string; user_id: string; recipe: Recipe; created_at: string; }

const CACHE = 'lb-community-cache';
let rows: CommunityRow[] = load();
const listeners = new Set<(r: CommunityRow[]) => void>();

function load(): CommunityRow[] {
  try {
    return JSON.parse(localStorage.getItem(CACHE) ?? '[]') as CommunityRow[];
  } catch {
    return [];
  }
}

function set(next: CommunityRow[]) {
  rows = next;
  try {
    localStorage.setItem(CACHE, JSON.stringify(next));
  } catch { /* offline copy is optional */ }
  listeners.forEach((f) => f(next));
}

export const communityRecipe = (id: string): Recipe | null => rows.find((r) => r.id === id)?.recipe ?? null;

export async function refreshCommunity(): Promise<void> {
  const c = cloud();
  if (!c || !(await liveUserId())) return;
  const { data, error } = await c.from('community_recipes').select('*').order('created_at', { ascending: false });
  if (!error && data) set(data as CommunityRow[]);
}

let refreshing: Promise<void> | null = null;

/** Community recipes, from the last copy straight away, refreshed in the background. */
export function useCommunityRecipes(): CommunityRow[] {
  const [list, setList] = useState(rows);
  useEffect(() => {
    listeners.add(setList);
    refreshing ??= refreshCommunity().finally(() => { refreshing = null; });
    return () => {
      listeners.delete(setList);
    };
  }, []);
  return list;
}

let contributor: Promise<boolean> | null = null;
export function isContributor(): Promise<boolean> {
  return (contributor ??= (async () => {
    const c = cloud();
    const uid = await liveUserId();
    if (!c || !uid) return false;
    const { data } = await c.from('contributors').select('user_id').eq('user_id', uid).maybeSingle();
    return Boolean(data);
  })());
}

export function useIsContributor() {
  const [yes, setYes] = useState(false);
  useEffect(() => {
    void isContributor().then(setYes);
  }, []);
  return yes;
}

/** Publish a copy of Ren's recipe. The community copy has its own id so her personal one stays hers. */
export async function publishRecipe(recipe: Recipe): Promise<string | null> {
  const c = cloud();
  if (!c || !(await liveUserId())) return null;
  const id = `community-${recipe.id.replace(/^(user|community)-/, '')}`;
  const copy: Recipe = {
    ...recipe,
    id,
    userOwned: false,
    basedOn: recipe.id,
    ingredients: recipe.ingredients.map((i, n) => ({ ...i, id: `${id}-i${n}` })),
    steps: recipe.steps.map((s, n) => ({ ...s, id: `${id}-s${n}` })),
    source: { ...recipe.source, provenance: 'Added to Love Bites by a family contributor' },
  };
  const { error } = await c.from('community_recipes').upsert({ id, recipe: copy, updated_at: new Date().toISOString() });
  if (error) return null;
  await refreshCommunity();
  return id;
}

export async function unpublishRecipe(id: string): Promise<boolean> {
  const { error } = (await cloud()?.from('community_recipes').delete().eq('id', id)) ?? { error: true };
  if (!error) await refreshCommunity();
  return !error;
}

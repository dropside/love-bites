// Family sharing: names, recipes people have shared, and who loves what.
import { useCallback, useEffect, useState } from 'react';
import type { Recipe } from '../domain/types';
import { db, patchCookbook } from '../state/db';
import { cloud, currentMember, liveUserId } from './client';

export interface FamilyShare {
  id: string;
  user_id: string;
  recipe_id: string;
  title: string;
  image: string | null;
  recipe: Recipe | null;
  note: string | null;
  created_at: string;
}

export interface FamilyData {
  names: Record<string, string>;
  shares: FamilyShare[];
  /** recipe id -> user ids who love it */
  loves: Record<string, string[]>;
}

const CACHE = 'lb-family-cache';
const empty: FamilyData = { names: {}, shares: [], loves: {} };

function cached(): FamilyData {
  try {
    return { ...empty, ...JSON.parse(localStorage.getItem(CACHE) ?? '{}') };
  } catch {
    return empty;
  }
}

const listeners = new Set<(d: FamilyData) => void>();
let current: FamilyData | null = null;

export async function refreshFamily(): Promise<FamilyData | null> {
  const c = cloud();
  if (!c || !(await liveUserId())) return null;
  const [p, s, l] = await Promise.all([
    c.from('profiles').select('id, display_name'),
    c.from('family_shares').select('*').order('created_at', { ascending: false }).limit(100),
    c.from('family_loves').select('user_id, recipe_id'),
  ]);
  if (p.error || s.error || l.error) return null;
  const loves: Record<string, string[]> = {};
  for (const r of l.data as { user_id: string; recipe_id: string }[]) (loves[r.recipe_id] ??= []).push(r.user_id);
  const data: FamilyData = {
    names: Object.fromEntries((p.data as { id: string; display_name: string }[]).map((r) => [r.id, r.display_name])),
    shares: s.data as FamilyShare[],
    loves,
  };
  current = data;
  try {
    localStorage.setItem(CACHE, JSON.stringify(data));
  } catch { /* offline copy is optional */ }
  listeners.forEach((f) => f(data));
  return data;
}

/** Family data, shown from the last copy straight away and refreshed in the background. */
export function useFamily() {
  const [data, setData] = useState<FamilyData>(() => current ?? cached());
  useEffect(() => {
    listeners.add(setData);
    void refreshFamily();
    return () => {
      listeners.delete(setData);
    };
  }, []);
  const me = currentMember()?.id ?? null;
  const nameOf = useCallback((id: string) => (id === me ? 'You' : data.names[id] ?? 'Family'), [data.names, me]);
  /** Other people who love this recipe. */
  const lovedBy = useCallback((recipeId: string) => (data.loves[recipeId] ?? []).filter((u) => u !== me).map((u) => data.names[u] ?? 'Family'), [data, me]);
  return { ...data, me, nameOf, lovedBy };
}

export async function shareRecipe(recipe: Recipe, note: string): Promise<boolean> {
  const c = cloud();
  if (!c || !(await liveUserId())) return false;
  const own = recipe.userOwned || recipe.id.startsWith('user-');
  const { error } = await c.from('family_shares').insert({
    recipe_id: recipe.id,
    title: recipe.title,
    image: recipe.image?.url ?? null,
    recipe: own ? recipe : null,
    note: note.trim() || null,
  });
  if (!error) void refreshFamily();
  return !error;
}

export async function unshare(id: string) {
  await cloud()?.from('family_shares').delete().eq('id', id);
  void refreshFamily();
}

/** Open a shared recipe: someone's own recipes are copied onto this device first. */
export async function bringHome(share: FamilyShare): Promise<string> {
  if (share.recipe && !(await db.userRecipes.get(share.recipe_id))) {
    await db.userRecipes.put({ ...share.recipe, userOwned: true, updatedAt: Date.now() });
  }
  await patchCookbook(share.recipe_id, { saved: true });
  return share.recipe_id;
}

export async function saveDisplayName(name: string): Promise<boolean> {
  const c = cloud();
  const uid = await liveUserId();
  if (!c || !uid) return false;
  const { error } = await c.from('profiles').upsert({ id: uid, display_name: name.trim().slice(0, 40), updated_at: new Date().toISOString() });
  if (!error) void refreshFamily();
  return !error;
}

export async function myDisplayName(): Promise<string | null> {
  const c = cloud();
  const uid = await liveUserId();
  if (!c || !uid) return null;
  const { data } = await c.from('profiles').select('display_name').eq('id', uid).maybeSingle();
  return (data as { display_name: string } | null)?.display_name ?? null;
}

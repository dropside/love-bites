// Shopping session state: one derivation used by the list and in-store mode, so they can't disagree.
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo } from 'react';
import type { BasketLine } from '../../domain/basket';
import { getCanonical } from '../../domain/ingredients';
import type { Dim, Product, ShopCategory } from '../../domain/types';
import { formatQuantity } from '../../domain/units';
import { activeSession, db, uid, weekStartOf, type ManualItemRow, type ShopLineStateRow } from '../../state/db';
import { useBasket, useHousehold, type BasketEntry } from '../../state/hooks';

export const CATEGORY_LABEL: Record<string, string> = {
  veg: 'Fruit and vegetables', meat: 'Meat and seafood', dairy: 'Dairy and eggs', bakery: 'Bakery', pantry: 'Pantry', frozen: 'Frozen', household: 'Household', other: 'Other',
};

export interface ShopRow {
  key: string;
  line: BasketLine;
  product: Product | null;
  extraProducts: { product: Product; count: number }[];
  count: number;
  weightGrams: number | null;
  estCents: number | null;
  /** What's counted in the total: actual price if entered, otherwise the estimate. */
  costCents: number | null;
  actualCents: number | null;
  checked: boolean;
  unavailable: boolean;
  state: ShopLineStateRow | null;
}

export function buildRows(lines: BasketLine[], products: Map<string, Product>, states: ShopLineStateRow[], sessionId: string): ShopRow[] {
  const byId = new Map(states.map((s) => [s.id, s]));
  const rows: ShopRow[] = [];
  for (const line of lines) {
    const needsBuying = line.plan != null || line.toBuy > 1e-9 || (!line.assumedStaple && line.uncertain.length > 0);
    if (!needsBuying || line.assumedStaple) continue;
    const state = byId.get(`${sessionId}|${line.key}`) ?? null;
    if (state?.removed) continue;
    const planLines = line.plan?.lines ?? [];
    const first = planLines[0];
    const product = first ? products.get(first.productId) ?? null : null;
    const baseCount = first?.count ?? 1;
    const count = state?.countOverride ?? baseCount;
    const firstCost = first ? (state?.countOverride != null && first.weightGrams == null ? count * (product?.priceCents ?? 0) : first.costCents) : null;
    const extras = planLines.slice(1).map((l) => ({ product: products.get(l.productId)!, count: l.count, cost: l.costCents })).filter((e) => e.product);
    const est = firstCost == null ? null : firstCost + extras.reduce((n, e) => n + e.cost, 0);
    rows.push({
      key: line.key,
      line,
      product,
      extraProducts: extras.map(({ product: p, count: c }) => ({ product: p, count: c })),
      count,
      weightGrams: first?.weightGrams ?? null,
      estCents: est,
      actualCents: state?.actualCents ?? null,
      costCents: state?.unavailable ? 0 : state?.actualCents ?? est,
      checked: Boolean(state?.checked),
      unavailable: Boolean(state?.unavailable),
      state,
    });
  }
  return rows;
}

export interface ShopTotals { total: number; remaining: number; items: number; done: number; unpriced: number; }

export function shopTotals(rows: ShopRow[], manual: ManualItemRow[]): ShopTotals {
  let total = 0;
  let remaining = 0;
  let done = 0;
  let unpriced = 0;
  for (const r of rows) {
    if (r.costCents == null) unpriced++;
    total += r.costCents ?? 0;
    if (r.checked || r.unavailable) done++;
    else remaining += r.costCents ?? 0;
  }
  for (const m of manual) {
    if (m.estCents == null) unpriced++;
    total += m.estCents ?? 0;
    if (m.checked) done++;
    else remaining += m.estCents ?? 0;
  }
  return { total, remaining, items: rows.length + manual.length, done, unpriced };
}

/** Everything a shopping screen needs. Reads straight from IndexedDB so it works offline and survives reloads. */
export function useShopping() {
  useEffect(() => {
    void activeSession();
  }, []);
  const session = useLiveQuery(() => db.sessions.where('status').equals('active').first(), []);
  const household = useHousehold();
  const week = session?.weekStart ?? weekStartOf();
  const meals = useLiveQuery(() => db.meals.where('weekStart').equals(week).toArray(), [week]);
  const extras = useLiveQuery(() => (session ? db.shopExtras.where('sessionId').equals(session.id).toArray() : []), [session?.id]);
  const lineStates = useLiveQuery(() => (session ? db.shopLines.where('sessionId').equals(session.id).toArray() : []), [session?.id]);
  const manual = useLiveQuery(() => (session ? db.manualItems.where('sessionId').equals(session.id).toArray() : []), [session?.id]);

  const entries = useMemo<BasketEntry[] | undefined>(() => {
    if (!meals || !extras) return undefined;
    return [...meals.filter((m) => !m.cooked).map((m) => ({ recipeId: m.recipeId, servings: m.servings })), ...extras.map((e) => ({ recipeId: e.recipeId, servings: e.servings }))];
  }, [meals, extras]);
  const { basket, data, ctx } = useBasket(entries);

  const rows = useMemo(() => (basket && data && session ? buildRows(basket.lines, data.products, lineStates ?? [], session.id) : null), [basket, data, lineStates, session]);
  const totals = useMemo(() => (rows ? shopTotals(rows, manual ?? []) : null), [rows, manual]);

  const groups = useMemo(() => {
    if (!rows) return [];
    const order = household.categoryOrder;
    const cat = new Map<string, { rows: ShopRow[]; manual: ManualItemRow[] }>();
    const get = (c: string) => {
      if (!cat.has(c)) cat.set(c, { rows: [], manual: [] });
      return cat.get(c)!;
    };
    for (const r of rows) get(r.line.category).rows.push(r);
    for (const m of manual ?? []) get(m.category).manual.push(m);
    return [...cat.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])).map(([category, v]) => ({ category, ...v }));
  }, [rows, manual, household.categoryOrder]);

  return { session, week, meals, extras, rows, totals, groups, manual: manual ?? [], basket, data, ctx, loading: !rows };
}

export async function patchLine(sessionId: string, key: string, patch: Partial<ShopLineStateRow>) {
  const id = `${sessionId}|${key}`;
  const current = (await db.shopLines.get(id)) ?? { id, sessionId, checked: false, checkedAt: null, unavailable: false, countOverride: null, actualCents: null, removed: false };
  await db.shopLines.put({ ...current, ...patch });
}

export async function setChecked(sessionId: string, key: string, checked: boolean) {
  await patchLine(sessionId, key, { checked, checkedAt: checked ? Date.now() : null });
}

export async function addManualItem(sessionId: string, name: string, category: ShopCategory = 'other', estCents: number | null = null) {
  await db.manualItems.put({ id: uid(), sessionId, name, category, estCents, checked: false, checkedAt: null });
}

export function needLabel(line: BasketLine): string {
  if (line.required) return formatQuantity(line.required.quantity, line.required.dim);
  return line.uncertain.join(', ') || 'amount not stated';
}

/** Pack description in Ren's terms: "2 × 500 g". */
export function packLabel(p: Product | null, count: number, weightGrams: number | null): string {
  if (!p) return '';
  if (p.variable) return `${formatQuantity(weightGrams ?? 0, 'g')} loose`;
  if (p.packDim === 'each') return p.packQty && p.packQty > 1 ? `${count} × ${p.packQty}-pack` : `${count} each`;
  return `${count} × ${p.packQty ? formatQuantity(p.packQty, p.packDim) : 'pack'}`;
}

/** Complete the shop. Optionally moves what was bought into the pantry, kept separate from consumption. */
export async function completeShop(sessionId: string, rows: ShopRow[], totalCents: number, addToPantry: boolean): Promise<number> {
  let added = 0;
  await db.transaction('rw', db.sessions, db.pantry, db.pantryLog, async () => {
    if (addToPantry) {
      for (const r of rows) {
        if (!r.checked || r.unavailable || !r.line.canonicalId) continue;
        const bought = r.line.plan?.boughtQty ?? 0;
        const dim: Dim | null = r.line.dim;
        if (!bought || !dim) continue;
        const scale = r.state?.countOverride != null && r.line.plan?.lines[0]?.count ? r.count / r.line.plan.lines[0].count : 1;
        const qty = bought * scale;
        const existing = await db.pantry.where('canonicalId').equals(r.line.canonicalId).first();
        const c = getCanonical(r.line.canonicalId);
        let pantryId: string;
        if (existing && existing.dim === dim && existing.quantity != null) {
          pantryId = existing.id;
          await db.pantry.update(existing.id, { quantity: existing.quantity + qty });
        } else if (!existing) {
          pantryId = uid();
          await db.pantry.put({ id: pantryId, canonicalId: r.line.canonicalId, name: c?.name ?? r.line.name, quantity: qty, dim, staple: false, expiry: null, location: c?.category === 'meat' || c?.category === 'dairy' ? 'fridge' : c?.category === 'frozen' ? 'freezer' : 'pantry', lowAt: null, addedAt: Date.now() });
        } else continue;
        await db.pantryLog.put({ id: uid(), pantryId, name: c?.name ?? r.line.name, delta: qty, dim, reason: 'Bought at Woolworths', at: Date.now(), undone: false });
        added++;
      }
    }
    await db.sessions.update(sessionId, { status: 'complete', completedAt: Date.now(), totalCents });
  });
  return added;
}

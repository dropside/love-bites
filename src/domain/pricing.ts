// Pack optimisation and price calculations. All money is integer cents.
import type { Cents, Dim, PriceStatus, Product } from './types';

export const formatMoney = (c: Cents | null | undefined): string =>
  c == null ? '—' : `$${(c / 100).toFixed(2)}`;

export function priceStatus(observedAt: string | null | undefined, now = Date.now()): PriceStatus {
  if (!observedAt) return 'unknown';
  const t = Date.parse(observedAt);
  if (Number.isNaN(t)) return 'unknown';
  const days = (now - t) / 86_400_000;
  if (days <= 7) return 'current';
  if (days <= 30) return 'recent';
  return 'stale';
}

export const PRICE_STATUS_LABEL: Record<PriceStatus, string> = {
  current: 'Observed this week',
  recent: 'Recent estimate',
  stale: 'Stale price',
  unknown: 'Unknown price',
};

export interface PackOption {
  productId: string;
  qty: number; // in dim units; for variable products ignored
  dim: Dim;
  priceCents: Cents; // per pack, or per kg when variable
  variable: boolean;
}

export interface PackLine {
  productId: string;
  count: number;
  /** For variable-weight items: grams at the scale. */
  weightGrams?: number;
  costCents: Cents;
}

export interface PackPlan {
  lines: PackLine[];
  costCents: Cents;
  boughtQty: number;
  leftoverQty: number;
}

export function productOption(p: Product): PackOption | null {
  if (p.priceCents == null) return null;
  if (p.variable) return { productId: p.id, qty: 0, dim: 'g', priceCents: p.priceCents, variable: true };
  if (p.packQty == null || p.packDim == null) return null;
  return { productId: p.id, qty: p.packQty, dim: p.packDim, priceCents: p.priceCents, variable: false };
}

const better = (a: PackPlan, b: PackPlan | null) => {
  if (!b) return true;
  if (a.costCents !== b.costCents) return a.costCents < b.costCents;
  if (a.leftoverQty !== b.leftoverQty) return a.leftoverQty < b.leftoverQty;
  return a.lines.reduce((n, l) => n + l.count, 0) < b.lines.reduce((n, l) => n + l.count, 0);
};

/**
 * Cheapest way to cover `need`. Minimises immediate checkout cost, then leftovers, then pack count.
 * All options must share a dimension. Combines pack sizes.
 */
export function optimisePacks(need: number, options: PackOption[]): PackPlan | null {
  if (need <= 0) return { lines: [], costCents: 0, boughtQty: 0, leftoverQty: 0 };
  let best: PackPlan | null = null;

  for (const o of options) {
    if (o.variable) {
      const cost = Math.ceil((need / 1000) * o.priceCents);
      const plan: PackPlan = {
        lines: [{ productId: o.productId, count: 1, weightGrams: Math.ceil(need), costCents: cost }],
        costCents: cost,
        boughtQty: need,
        leftoverQty: 0,
      };
      if (better(plan, best)) best = plan;
    }
  }

  const fixed = options.filter((o) => !o.variable && o.qty > 0).slice(0, 8);
  const counts = new Array<number>(fixed.length).fill(0);

  const search = (i: number, remaining: number, cost: number) => {
    if (best && cost > best.costCents) return;
    if (remaining <= 1e-6) {
      const lines = fixed.flatMap((o, k) =>
        counts[k] ? [{ productId: o.productId, count: counts[k], costCents: counts[k] * o.priceCents }] : [],
      );
      const bought = fixed.reduce((n, o, k) => n + counts[k] * o.qty, 0);
      const plan = { lines, costCents: cost, boughtQty: bought, leftoverQty: bought - need };
      if (better(plan, best)) best = plan;
      return;
    }
    if (i >= fixed.length) return;
    const o = fixed[i];
    const max = Math.min(Math.ceil(remaining / o.qty), 40);
    for (let n = max; n >= 0; n--) {
      counts[i] = n;
      search(i + 1, remaining - n * o.qty, cost + n * o.priceCents);
    }
    counts[i] = 0;
  };
  search(0, need, 0);
  return best;
}

/** Cost of the portion actually used, based on the pack's price. */
export function proportionalCost(usedQty: number, packQty: number, priceCents: Cents): Cents {
  if (packQty <= 0) return 0;
  return Math.round((usedQty / packQty) * priceCents);
}

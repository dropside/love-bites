// Canonical ingredient -> Woolworths product matching. Runs at data-build time; the app reads the table.
import { CANONICAL_INGREDIENTS } from './canonicalData';
import type { CanonicalIngredient, MatchTable, Product, ProductMatchEntry } from './types';

const NON_FOOD = new Set(['Health & Body', 'Household', 'Baby & Child', 'Pet']);

// Prepared foods that merely contain the ingredient. Ignored unless the search itself asks for them.
const PREPARED = new Set(['pie','quiche','salad','sandwich','soup','pizza','meal','snack','chip','cracker','sauce','dip','wrap','roll','seasoning','marinated','crumbed','mix','stuffing','slice','sushi','burger','nugget','kiev','bake','curry','stirfry','kit','noodle','cake','biscuit','bar','drink','juice','spread','flavoured','flavour','pate','sprout','sprouts','substitute','fried','microwave','ready','pasta','rice','lollie','truffle','salmon','licorice','oat','granola','muesli','cereal','cookie','puff','lolly','lollies','marshmallow','milk','barista','milklab','brownie','gherkin','tuna','olive','recipe','base','pickle','slaw','precooked','ale','sensation','chow','mein','wrap','toast','bagel','crouton','crisp','popcorn','ravioli','stock','gravy','schnitzel','meatball','tortellini','ravioli','sausage','tart','muffin','quesadilla','nacho']);

const tokens = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const singular = (t: string) => (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t);

function hasAll(name: Set<string>, query: string[]) {
  return query.every((q) => name.has(singular(q)));
}

/** Score one product for one ingredient: null when it's not a valid candidate. */
export function scoreProduct(c: CanonicalIngredient, p: Product): number | null {
  if (NON_FOOD.has(p.dept)) return null;
  if (c.departments && !c.departments.includes(p.dept)) return null;
  const toks = tokens(p.name).map(singular);
  const set = new Set(toks);
  if (c.exclude?.some((x) => set.has(singular(x)))) return null;
  // The first search phrase the name satisfies without being a prepared food.
  const idx = c.query.findIndex((q) => {
    if (!hasAll(set, tokens(q))) return false;
    const qt = tokens(q).map(singular);
    return !toks.some((t) => PREPARED.has(t) && !qt.includes(t));
  });
  if (idx < 0) return null;
  const queryToks = tokens(c.query[idx]).map(singular);
  const queryLen = queryToks.length;
  // Fewer extra words = closer to the plain ingredient.
  const extras = toks.length - queryLen;
  const brandToks = p.brand ? tokens(p.brand).length : 0;
  let score = 1 - idx * 0.08 - Math.max(0, extras - brandToks) * 0.05;
  if (c.departments && p.dept === c.departments[0]) score += 0.08;
  return Math.max(0.05, Math.min(1, score));
}

function comparableUnitPrice(p: Product): number | null {
  if (p.priceCents == null) return null;
  if (p.variable) return p.priceCents / 1000;
  if (p.packQty) return p.priceCents / p.packQty;
  return null;
}

/** Ranked candidates: name quality first, then per-unit price, with a stable tiebreak. */
export function rankCandidates(c: CanonicalIngredient, products: Product[], limit = 16): ProductMatchEntry[] {
  const scored: { p: Product; s: number; u: number }[] = [];
  for (const p of products) {
    const s = scoreProduct(c, p);
    if (s == null) continue;
    const u = comparableUnitPrice(p);
    if (u == null) continue;
    scored.push({ p, s, u });
  }
  scored.sort((a, b) => {
    const band = Math.round(b.s * 5) - Math.round(a.s * 5);
    return band || a.u - b.u || a.p.id.localeCompare(b.p.id);
  });
  return scored.slice(0, limit).map(({ p, s }) => ({ productId: p.id, confidence: +s.toFixed(2) }));
}

export function buildMatchTable(products: Product[]): MatchTable {
  const table: MatchTable = {};
  for (const c of CANONICAL_INGREDIENTS) {
    if (c.free) continue;
    const ranked = rankCandidates(c, products);
    if (ranked.length) table[c.id] = ranked;
  }
  return table;
}

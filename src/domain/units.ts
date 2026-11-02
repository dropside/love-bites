// Quantity handling. Volume never converts to weight without ingredient-specific density.
import type { CanonicalIngredient, Dim } from './types';

/** NZ metric measures. */
const MASS: Record<string, number> = {
  g: 1, gm: 1, gms: 1, gram: 1, grams: 1, gr: 1,
  kg: 1000, kgs: 1000, kilo: 1000, kilos: 1000, kilogram: 1000, kilograms: 1000,
  oz: 28.35, ounce: 28.35, ounces: 28.35,
  lb: 453.6, lbs: 453.6, pound: 453.6, pounds: 453.6,
};

const VOLUME: Record<string, number> = {
  ml: 1, mls: 1, millilitre: 1, millilitres: 1, milliliter: 1, milliliters: 1, cc: 1,
  cl: 10, dl: 100,
  l: 1000, lt: 1000, ltr: 1000, litre: 1000, litres: 1000, liter: 1000, liters: 1000,
  tsp: 5, tsps: 5, teaspoon: 5, teaspoons: 5, t: 5,
  tbsp: 15, tbsps: 15, tbs: 15, tb: 15, tablespoon: 15, tablespoons: 15, dsp: 10,
  cup: 250, cups: 250,
  'fl oz': 29.57, floz: 29.57, pint: 568, pints: 568, pt: 568, quart: 946, quarts: 946, qt: 946, gallon: 3785,
};

const COUNT = new Set([
  'each', 'ea', 'whole', 'piece', 'pieces', 'pc', 'pcs', 'item', 'items', 'large', 'medium', 'small', 'big', 'unit', 'units',
  'fillet', 'fillets', 'breast', 'breasts', 'thigh', 'thighs', 'leg', 'legs', 'slice', 'slices', 'rasher', 'rashers',
  'clove', 'cloves', 'stick', 'sticks', 'stalk', 'stalks', 'rib', 'ribs', 'head', 'heads', 'ear', 'ears',
]);

/** Named measures with no reliable numeric meaning. They stay as stated and are flagged. */
const VAGUE = new Set([
  'bunch', 'bunches', 'handful', 'handfuls', 'sprig', 'sprigs', 'pinch', 'pinches', 'dash', 'dashes', 'splash', 'drizzle',
  'knob', 'can', 'cans', 'tin', 'tins', 'jar', 'jars', 'packet', 'packets', 'pack', 'packs', 'package', 'packages', 'pkg',
  'bag', 'bags', 'box', 'boxes', 'bottle', 'bottles', 'sachet', 'sachets', 'envelope', 'cube', 'cubes', 'leaf', 'leaves', 'drop', 'drops',
  'sheet', 'sheets', 'strip', 'strips', 'scoop', 'scoops', 'glass', 'shot', 'tub', 'tubs', 'carton', 'cartons',
]);

export interface Normalised {
  quantity: number;
  unit: string; // g | ml | each | vague measure
  dim: Dim | null; // null when vague
}

export function unitKind(unit: string): 'mass' | 'volume' | 'count' | 'vague' | 'unknown' {
  const u = unit.toLowerCase().replace(/\.$/, '');
  if (u in MASS) return 'mass';
  if (u in VOLUME) return 'volume';
  if (COUNT.has(u)) return 'count';
  if (VAGUE.has(u)) return 'vague';
  return 'unknown';
}

const singularVague = (u: string) => {
  if (u === 'bunches') return 'bunch';
  if (u === 'pinches') return 'pinch';
  if (u === 'dashes') return 'dash';
  if (u === 'boxes') return 'box';
  if (u === 'leaves') return 'leaf';
  if (u === 'pkg' || u === 'package' || u === 'packages' || u === 'packs') return 'pack';
  return u.endsWith('s') && u !== 'glass' ? u.slice(0, -1) : u;
};

/** Convert a stated quantity + unit to base units (g, ml, each); vague units are preserved. */
export function normaliseUnit(quantity: number, unit: string | null): Normalised {
  if (!unit) return { quantity, unit: 'each', dim: 'each' };
  const u = unit.toLowerCase().replace(/\.$/, '');
  if (u in MASS) return { quantity: quantity * MASS[u], unit: 'g', dim: 'g' };
  if (u in VOLUME) return { quantity: quantity * VOLUME[u], unit: 'ml', dim: 'ml' };
  if (COUNT.has(u)) return { quantity, unit: 'each', dim: 'each' };
  return { quantity, unit: singularVague(u), dim: null };
}

/**
 * Convert between dimensions using only the ingredient's own conversion data.
 * Returns null when no honest conversion exists.
 */
export function convertDim(
  quantity: number,
  from: Dim,
  to: Dim,
  ing?: Pick<CanonicalIngredient, 'density' | 'eachGrams'> | null,
): number | null {
  if (from === to) return quantity;
  const density = ing?.density;
  const each = ing?.eachGrams;
  if (from === 'ml' && to === 'g') return density ? quantity * density : null;
  if (from === 'g' && to === 'ml') return density ? quantity / density : null;
  if (from === 'each' && to === 'g') return each ? quantity * each : null;
  if (from === 'g' && to === 'each') return each ? quantity / each : null;
  if (from === 'each' && to === 'ml') return each && density ? (quantity * each) / density : null;
  if (from === 'ml' && to === 'each') return each && density ? (quantity * density) / each : null;
  return null;
}

const VULGAR: Record<string, string> = {
  '½': '1/2', '¼': '1/4', '¾': '3/4', '⅓': '1/3', '⅔': '2/3', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8', '⅕': '1/5', '⅖': '2/5', '⅙': '1/6',
};

export function expandVulgar(s: string): string {
  return s.replace(/(\d)?([½¼¾⅓⅔⅛⅜⅝⅞⅕⅖⅙])/g, (_, d, f) => (d ? `${d} ${VULGAR[f]}` : VULGAR[f]));
}

/** Parse "1 1/2", "1/2", "1.5", "2". */
export function parseNumber(s: string): number | null {
  const t = expandVulgar(s).trim();
  let m = t.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (m) return +m[3] ? +m[1] + +m[2] / +m[3] : null;
  m = t.match(/^(\d+)\/(\d+)$/);
  if (m) return +m[2] ? +m[1] / +m[2] : null;
  if (/^\d*[.,]?\d+$/.test(t)) return parseFloat(t.replace(',', '.'));
  return null;
}

/** Pretty quantity for display: friendly fractions, grams to kg. */
export function formatQuantity(quantity: number | null, unit: string | null): string {
  if (quantity == null) return unit ?? '';
  if (unit === 'g') return quantity >= 1000 ? `${trim(quantity / 1000, 2)} kg` : `${roundCooking(quantity)} g`;
  if (unit === 'ml') return quantity >= 1000 ? `${trim(quantity / 1000, 2)} L` : `${roundCooking(quantity)} ml`;
  if (unit === 'each' || unit == null) return fraction(quantity);
  return `${fraction(quantity)} ${quantity > 1 && !unit.endsWith('s') && unit !== 'pinch' ? pluralise(unit) : unit}`;
}

function pluralise(u: string) {
  if (u === 'bunch' || u === 'pinch' || u === 'dash' || u === 'box') return `${u}es`;
  if (u === 'leaf') return 'leaves';
  return `${u}s`;
}

function trim(n: number, dp: number) {
  return String(+n.toFixed(dp));
}

/** Sensible kitchen rounding: tiny amounts keep precision, big ones snap to 5g/ml. */
export function roundCooking(q: number): number {
  if (q < 10) return +q.toFixed(q < 2 ? 1 : 0);
  if (q < 100) return Math.round(q);
  return Math.round(q / 5) * 5;
}

const FRACTIONS: [number, string][] = [
  [0.125, '⅛'], [0.25, '¼'], [1 / 3, '⅓'], [0.5, '½'], [2 / 3, '⅔'], [0.75, '¾'],
];

export function fraction(q: number): string {
  const whole = Math.floor(q + 0.02);
  const rest = q - whole;
  if (rest < 0.06) return String(whole);
  for (const [v, s] of FRACTIONS) if (Math.abs(rest - v) < 0.06) return whole ? `${whole}${s}` : s;
  if (rest > 0.94) return String(whole + 1);
  return trim(q, 1);
}

/** Parse a supermarket size string: 500g, 1.5kg, 750mL, 1L, 6pack, 1ea, per kg. */
export function parsePackSize(size: string | null | undefined): { qty: number; dim: Dim } | null {
  if (!size) return null;
  const s = size.trim().toLowerCase();
  const m = s.match(/^(\d*\.?\d+)\s*(g|kg|ml|l|pack|ea|pk|each)$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!(n > 0)) return null;
  switch (m[2]) {
    case 'g': return { qty: n, dim: 'g' };
    case 'kg': return { qty: n * 1000, dim: 'g' };
    case 'ml': return { qty: n, dim: 'ml' };
    case 'l': return { qty: n * 1000, dim: 'ml' };
    default: return { qty: n, dim: 'each' };
  }
}

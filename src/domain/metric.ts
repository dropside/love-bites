// Rewrite imperial measures in recipe text as metric, so imported recipes read like the rest of the app.
// Teaspoons and tablespoons stay: they're the everyday NZ measure. Cups become grams only when the ingredient's density is known.
import { getCanonical, resolveCanonical } from './ingredients';
import { expandVulgar, formatQuantity, parseNumber } from './units';

const NUM = String.raw`(\d+\s+\d+\/\d+|\d+\/\d+|\d*\.\d+|\d+)`;
const RANGE = String.raw`${NUM}(?:\s*(?:-|–|to)\s*${NUM})?`;

const VOLUME_ML: Record<string, number> = { cup: 250, 'fl oz': 29.57, pint: 568, quart: 946 };
const MASS_G: Record<string, number> = { oz: 28.35, lb: 453.6, stick: 113 };

const UNIT_RE = String.raw`(cups?|c\.|fl\.?\s?oz|fluid ounces?|pints?|pts?|quarts?|qts?|ounces?|oz|pounds?|lbs?|sticks?)`;

function canonicalUnit(u: string): string {
  const s = u.toLowerCase().replace(/\.$/, '').replace(/\s+/g, ' ');
  if (s === 'c' || s.startsWith('cup')) return 'cup';
  if (s.startsWith('fl') || s.startsWith('fluid')) return 'fl oz';
  if (s.startsWith('pint') || s.startsWith('pt')) return 'pint';
  if (s.startsWith('quart') || s.startsWith('qt')) return 'quart';
  if (s.startsWith('ounce') || s === 'oz') return 'oz';
  if (s.startsWith('pound') || s.startsWith('lb')) return 'lb';
  return 'stick';
}

/** Format one converted amount, with an optional upper bound. */
function amount(q: number, max: number | null, unit: 'g' | 'ml'): string {
  const one = formatQuantity(q, unit);
  if (max == null) return one;
  const [lo, loUnit] = one.split(' ');
  const hi = formatQuantity(max, unit);
  return hi.split(' ')[1] === loUnit ? `${lo}–${hi}` : `${one}–${hi}`;
}

function convertAmount(qty: number, max: number | null, unit: string, ingredientText: string): string | null {
  const u = canonicalUnit(unit);
  if (u in MASS_G) {
    // Only butter comes in sticks.
    if (u === 'stick' && !/butter|margarine/i.test(ingredientText)) return null;
    return amount(qty * MASS_G[u], max == null ? null : max * MASS_G[u], 'g');
  }
  const ml = qty * VOLUME_ML[u];
  const mlMax = max == null ? null : max * VOLUME_ML[u];
  if (u === 'cup') {
    // Liquids (density near 1) read better in ml; flour, sugar, rice and the like in grams.
    const density = getCanonical(resolveCanonical(ingredientText).id)?.density;
    if (density && Math.abs(density - 1) > 0.1) return amount(ml * density, mlMax == null ? null : mlMax * density, 'g');
  }
  return amount(ml, mlMax, 'ml');
}

const toC = (f: number) => Math.round(((f - 32) * 5) / 9 / 10) * 10;
const toCm = (inch: number) => Math.round(inch * 2.54);

/** Convert any imperial amounts, temperatures and sizes in a piece of recipe text. */
export function metricise(text: string): string {
  let s = expandVulgar(text);
  // Many sites give both: "180g (6 oz)" or "6 oz / 180g". Keep the metric one rather than doubling up.
  if (/\d\s*(?:g|kg|ml|l)\b/i.test(s)) {
    const imperial = String.raw`${RANGE}\s*${UNIT_RE}(?![a-z])\.?`;
    s = s
      .replace(new RegExp(String.raw`\s*\(\s*${imperial}\s*\)`, 'gi'), '')
      .replace(new RegExp(String.raw`${imperial}\s*\/\s*(?=\d)`, 'gi'), '')
      .replace(new RegExp(String.raw`\s*\/\s*${imperial}`, 'gi'), '');
  }
  // Oven temperatures: 350°F, 350 degrees F, 350F. Three digits only, so "2 F" can't be misread.
  s = s.replace(/(\d{3})\s*(?:°|º|degrees?)?\s*F(?:ahrenheit)?\b/g, (_, f: string) => `${toC(+f)}°C`);
  // Pan sizes: 9x13-inch, 9 x 13 inches, 8" square.
  s = s.replace(/(\d+(?:\.\d+)?)\s*(?:x|×|by)\s*(\d+(?:\.\d+)?)(?:-|\s)?(?:inch(?:es)?|in\.|"|”)(?![a-z])/gi, (_, a: string, b: string) => `${toCm(+a)} x ${toCm(+b)} cm`);
  s = s.replace(/(\d+(?:\.\d+)?)(?:-|\s)?(?:inch(?:es)?|in\.|"|”)(?![a-z])/gi, (_, a: string) => `${toCm(+a)} cm`);
  // Amounts: "1 1/2 cups flour", "8 oz cheese", "2-3 lbs chicken", "1 (14 oz) can".
  const re = new RegExp(String.raw`${RANGE}\s*${UNIT_RE}(?![a-z])(\.?)`, 'gi');
  s = s.replace(re, (all: string, a: string, b: string | undefined, unit: string, _dot: string, offset: number) => {
    const qty = parseNumber(a);
    if (qty == null) return all;
    const max = b ? parseNumber(b) : null;
    const after = s.slice(offset + all.length, offset + all.length + 60);
    return convertAmount(qty, max, unit, after.replace(/^\s*(?:of\s+)?/, '').split(/[,;.(]/)[0]) ?? all;
  });
  return s;
}

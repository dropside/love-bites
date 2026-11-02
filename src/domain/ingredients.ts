// Ingredient text -> structured, canonical ingredient. Deterministic and independent of the UI.
import { CANONICAL_INGREDIENTS } from './canonicalData';
import type { CanonicalIngredient, RecipeIngredient } from './types';
import { expandVulgar, normaliseUnit, parseNumber, unitKind } from './units';

const BY_ID = new Map(CANONICAL_INGREDIENTS.map((c) => [c.id, c]));
export const getCanonical = (id: string | null | undefined) => (id ? BY_ID.get(id) : undefined);

const NOISE = new Set([
  'fresh', 'freshly', 'chopped', 'finely', 'roughly', 'coarsely', 'thinly', 'thickly', 'sliced', 'diced', 'minced', 'crushed', 'grated', 'peeled',
  'seeded', 'deseeded', 'large', 'medium', 'small', 'big', 'ripe', 'lean', 'organic', 'good', 'quality', 'free-range', 'free', 'range', 'optional',
  'about', 'approx', 'approximately', 'some', 'extra', 'a', 'an', 'the', 'of', 'to', 'taste', 'for', 'serving', 'garnish', 'cooked', 'raw', 'whole',
  'trimmed', 'halved', 'quartered', 'cubed', 'drained', 'rinsed', 'beaten', 'melted', 'softened', 'cold', 'warm', 'room', 'temperature', 'dried', 'tinned',
  'shredded', 'ground', 'skinless', 'boneless', 'and', 'or', 'plus', 'more', 'needed', 'as', 'if', 'desired', 'thick', 'thin', 'pieces', 'piece', 'cut', 'into',
  'in', 'on', 'with', 'washed', 'clean', 'cleaned', 'torn', 'stemmed', 'pitted', 'toasted', 'roasted', 'canned', 'frozen', 'thawed', 'defrosted', 'pure',
]);

const stem = (w: string) => {
  if (w.length < 4) return w;
  if (w.endsWith('oes')) return w.slice(0, -2);
  if (w.endsWith('ies') && w.length > 4) return `${w.slice(0, -3)}y`;
  if (w.endsWith('ches') || w.endsWith('shes')) return w.slice(0, -2);
  if (w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us')) return w.slice(0, -1);
  return w;
};

export function normaliseText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9 &-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const key = (s: string) => normaliseText(s).split(' ').map(stem).join(' ');
const looseKey = (s: string) =>
  normaliseText(s).split(/[ -]/).filter((w) => !NOISE.has(w)).map(stem).join(' ');

const EXACT = new Map<string, string>();
const LOOSE = new Map<string, string>();
const WORD_INDEX: { words: string[]; id: string }[] = [];
for (const c of CANONICAL_INGREDIENTS) {
  for (const a of c.aliases) {
    if (!EXACT.has(key(a))) EXACT.set(key(a), c.id);
    const lk = looseKey(a);
    if (lk && !LOOSE.has(lk)) LOOSE.set(lk, c.id);
    if (lk) WORD_INDEX.push({ words: lk.split(' '), id: c.id });
  }
}
WORD_INDEX.sort((a, b) => b.words.length - a.words.length);

/** Ingredients that read like a canonical one but are something else entirely. */
const BLOCK = /\b(flavou?red|free from|substitute|vegan (butter|cheese|cream)|powdered milk|seasoning mix|gravy|bouillon powder)\b/;

export interface Resolution {
  id: string | null;
  confidence: number;
}

/** Resolve free text to a canonical ingredient: exact, then synonym, then contained phrase. */
export function resolveCanonical(text: string): Resolution {
  const exact = EXACT.get(key(text));
  if (exact) return { id: exact, confidence: 1 };
  const lk = looseKey(text);
  if (!lk) return { id: null, confidence: 0 };
  const loose = LOOSE.get(lk);
  if (loose) return { id: loose, confidence: 0.95 };
  if (BLOCK.test(normaliseText(text))) return { id: null, confidence: 0 };
  const tokens = lk.split(' ');
  for (const entry of WORD_INDEX) {
    const n = entry.words.length;
    for (let i = 0; i + n <= tokens.length; i++) {
      if (entry.words.every((w, j) => tokens[i + j] === w)) {
        // Head noun sits at the end in English: "tomato soup" is not tomato.
        const atEnd = i + n === tokens.length;
        if (atEnd) return { id: entry.id, confidence: n > 1 ? 0.85 : 0.7 };
        if (n > 1) return { id: entry.id, confidence: 0.6 };
      }
    }
  }
  return { id: null, confidence: 0 };
}

const NUM = String.raw`\d+\s+\d+/\d+|\d+/\d+|\d*[.,]?\d+`;
const LEADING = new RegExp(String.raw`^(?:about |approx\.? |around |~)?(${NUM})(?:\s*(?:-|–|—|to)\s*(${NUM}))?\s*`, 'i');
const WORD_NUM: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, half: 0.5, dozen: 12 };
const VAGUE_ONLY = /^(to taste|as needed|as required|for (frying|serving|garnish|dusting|greasing|the tin|brushing|drizzling)|handful|pinch|dash|splash|drizzle|some|a little|a few|few|sprinkling|sprinkle|garnish|top|to serve|to garnish|to glaze|dusting|greasing|chopped|sliced)\b/i;

export interface ParsedMeasure {
  quantity: number | null;
  quantityMax: number | null;
  unit: string | null;
  rest: string;
  vagueText: string | null;
}

/** Split a measure from the head of a string. */
export function parseMeasure(raw: string): ParsedMeasure {
  let s = expandVulgar(raw).replace(/\s+/g, ' ').trim().replace(/^[-*•]\s*/, '').replace(/^(?:the )?(?:juice|zest|rind)(?: and (?:juice|zest|rind))? of\s+/i, '');
  let quantity: number | null = null;
  let quantityMax: number | null = null;
  const m = s.match(LEADING);
  if (m) {
    quantity = parseNumber(m[1]);
    quantityMax = m[2] ? parseNumber(m[2]) : null;
    s = s.slice(m[0].length);
  } else {
    const w = s.match(/^(a|an|one|two|three|four|five|six|half|dozen)\s+/i);
    if (w) {
      quantity = WORD_NUM[w[1].toLowerCase()];
      s = s.slice(w[0].length);
    }
  }
  // "2 x 400g tins", "1 (400g) can"
  const mult = s.match(/^(?:x|×)\s*(\d+(?:\.\d+)?)\s*(g|kg|ml|l)\b\s*/i);
  if (mult && quantity != null) {
    quantity = quantity * parseFloat(mult[1]);
    s = `${mult[2]} ${s.slice(mult[0].length)}`;
  }
  const paren = s.match(/^\(?\s*(\d+(?:\.\d+)?)\s*-?\s*(g|kg|ml|l|oz|ounce|lb|pound)s?\b\.?\s*\)?\s*(?:cans?|tins?|jars?|packets?|packs?|bags?|bottles?|tubs?|cartons?)?\s*/i);
  if (paren && quantity != null) {
    quantity = quantity * parseFloat(paren[1]);
    s = `${paren[2]} ${s.slice(paren[0].length)}`;
  }
  let unit: string | null = null;
  const u = s.match(/^(fl\.?\s?oz|[a-zA-Z]+)\.?(?=[\s,]|$)\s*(?:of\s+)?/);
  if (u && quantity != null) {
    const candidate = u[1].toLowerCase().replace(/\s/g, ' ');
    const kind = unitKind(candidate === 'fl.oz' ? 'fl oz' : candidate);
    // The single-letter "T"/"t" and sizes only count when followed by something.
    if (kind !== 'unknown' && !(candidate === 't' && !/^t\b/i.test(u[1]))) {
      unit = candidate === 'fl.oz' ? 'fl oz' : candidate;
      s = s.slice(u[0].length);
    }
  }
  if (quantity == null) {
    const lead = s.match(VAGUE_ONLY);
    if (lead) return { quantity: null, quantityMax: null, unit: lead[1].toLowerCase(), rest: s.slice(lead[0].length).replace(/^\s*of\s+/, ''), vagueText: lead[1].toLowerCase() };
  }
  return { quantity, quantityMax, unit, rest: s.trim(), vagueText: null };
}

const COMBINED = /^(salt|sea salt) (and|&) (black )?pepper$/i;

/** Build a structured ingredient from a free text line. */
export function parseIngredientLine(id: string, line: string, section?: string | null): RecipeIngredient {
  const clean = line.replace(/\s+/g, ' ').trim();
  const optional = /\boptional\b|\bif (you )?(like|desired|wish)\b|\bto serve\b|\bto garnish\b|\bfor garnish\b/i.test(clean);
  const noParen = clean.replace(/\(([^)]*)\)/g, (all, inner: string) => (/^\s*\d/.test(inner) && !/^\s*\d+\s*(g|kg|ml|l|oz|lb)/i.test(inner) ? '' : all));
  const m = parseMeasure(noParen);
  const body = m.rest.replace(/\(optional\)/i, '').replace(/^\(|\)$/g, '').replace(/^of\s+/i, '').trim();
  const [head, ...prepParts] = body.split(/,| - | – /);
  let prep = prepParts.join(', ').trim() || null;
  const headClean = head.replace(/\([^)]*\)/g, '').trim();
  const res = resolveCanonical(headClean);
  const resolved = res.id ? res : resolveCanonical(body);
  if (!prep) {
    const pm = headClean.match(/\b((?:finely |roughly |thinly )?(?:chopped|sliced|diced|minced|grated|crushed|peeled))\b/i);
    if (pm) prep = pm[1].toLowerCase();
  }
  return assemble(id, clean, headClean || body, m.quantity, m.quantityMax, m.unit, m.vagueText, prep, optional, resolved, section ?? null);
}

/** Build from separated "measure" and "name" fields, like TheMealDB's. */
export function parseMeasuredIngredient(id: string, measure: string, name: string): RecipeIngredient {
  const m = parseMeasure(measure);
  let quantity = m.quantity;
  let unit = m.unit;
  let vague = m.vagueText;
  const restWords = m.rest.toLowerCase();
  if (quantity == null && !vague && restWords) vague = restWords.slice(0, 30);
  if (quantity != null && !unit && restWords) {
    // "1 large", "2 chopped": an adjective rather than a unit.
    const first = restWords.split(/[ ,]/)[0];
    if (unitKind(first) !== 'unknown') unit = first;
  }
  const res = resolveCanonical(name);
  const prep = m.rest && !unit ? null : m.rest && unit ? m.rest.replace(/^\w+\s*/, '') || null : null;
  const original = `${measure.trim()} ${name.trim()}`.trim();
  const optional = /\b(garnish|to serve|optional)\b/i.test(measure);
  return assemble(id, original, name.trim(), quantity, m.quantityMax, unit, vague, prep, optional, res, null);
}

function assemble(
  id: string,
  original: string,
  name: string,
  rawQty: number | null,
  rawMax: number | null,
  rawUnit: string | null,
  vagueText: string | null,
  prep: string | null,
  optional: boolean,
  res: Resolution,
  section: string | null,
): RecipeIngredient {
  const canonical = res.id ? BY_ID.get(res.id) : undefined;
  const flags: string[] = [];
  let quantity: number | null = null;
  let quantityMax: number | null = null;
  let unit: string | null = null;
  if (rawQty != null && rawQty > 0) {
    const n = normaliseUnit(rawQty, rawUnit);
    quantity = +n.quantity.toFixed(3);
    unit = n.unit;
    if (rawMax != null) quantityMax = +normaliseUnit(rawMax, rawUnit).quantity.toFixed(3);
    if (n.dim === null) flags.push('vague-measure');
  } else if (vagueText) {
    unit = vagueText;
    flags.push('no-quantity');
  } else {
    flags.push('no-quantity');
  }
  if (!canonical) flags.push('unknown-ingredient');
  if (res.confidence > 0 && res.confidence < 0.8) flags.push('uncertain-match');
  if (COMBINED.test(name)) flags.push('combined-seasoning');
  return {
    id,
    original,
    canonicalId: canonical?.id ?? null,
    name: canonical?.name ?? name,
    quantity,
    quantityMax,
    unit,
    prep,
    optional,
    noScale: Boolean(canonical?.seasoning) || quantity == null,
    confidence: res.confidence,
    flags,
    section,
  };
}

/** Temporary serving change. Never mutates the stored recipe. */
export function scaleIngredient(ing: RecipeIngredient, factor: number): RecipeIngredient {
  if (ing.quantity == null) return { ...ing };
  if (ing.noScale) {
    // Seasoning scales gently: half the proportional change, so doubling isn't double salt.
    const damped = 1 + (factor - 1) * 0.5;
    return { ...ing, quantity: Math.max(ing.quantity * damped, ing.quantity * 0.5) };
  }
  return {
    ...ing,
    quantity: ing.quantity * factor,
    quantityMax: ing.quantityMax != null ? ing.quantityMax * factor : ing.quantityMax,
  };
}

export type { CanonicalIngredient };

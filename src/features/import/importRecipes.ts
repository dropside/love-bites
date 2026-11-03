// Import recipes for Ren's own use: from a link, pasted text, JSON (including schema.org Recipe) or simple CSV. Stored on this device only.
import { z } from 'zod';
import { getCanonical, parseIngredientLine } from '../../domain/ingredients';
import { classifyMealTypes } from '../../domain/mealTypes';
import { metricise } from '../../domain/metric';
import type { Allergen, Recipe } from '../../domain/types';
import { uid } from '../../state/db';
import { extractTimers } from '../recipe/recipeUtils';

const Input = z.object({
  title: z.string().min(1),
  description: z.string().nullish(),
  servings: z.coerce.number().positive().nullish(),
  minutes: z.coerce.number().positive().nullish(),
  ingredients: z.array(z.string().min(1)).min(1),
  steps: z.array(z.string().min(1)).default([]),
  sourceUrl: z.string().url().nullish(),
  image: z.string().url().nullish(),
});
export type ImportInput = z.infer<typeof Input>;

const asText = (x: unknown): string => {
  if (typeof x === 'string') return x;
  if (x && typeof x === 'object' && 'text' in x) return String((x as { text: unknown }).text);
  return '';
};

function isoMinutes(s: unknown): number | null {
  const m = typeof s === 'string' ? s.match(/^PT(?:(\d+)H)?(?:(\d+)M)?/) : null;
  return m && (m[1] || m[2]) ? +(m[1] ?? 0) * 60 + +(m[2] ?? 0) : null;
}

function imageOf(x: unknown): string | null {
  if (typeof x === 'string') return /^https?:\/\//.test(x) ? x : null;
  if (Array.isArray(x)) return x.map(imageOf).find(Boolean) ?? null;
  if (x && typeof x === 'object' && 'url' in x) return imageOf((x as { url: unknown }).url);
  return null;
}

/** Strip any HTML tags and entities some sites leave in their structured data. */
const plain = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&#039;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

/** Convert a schema.org Recipe object to our input shape. */
export function fromJsonLd(o: Record<string, unknown>): ImportInput {
  const instr = o.recipeInstructions;
  const steps = Array.isArray(instr)
    ? instr.flatMap((s) => (s && typeof s === 'object' && 'itemListElement' in s ? ((s as { itemListElement: unknown[] }).itemListElement ?? []).map(asText) : [asText(s)]))
    : typeof instr === 'string' ? instr.split(/\n+/) : [];
  const yieldRaw = Array.isArray(o.recipeYield) ? o.recipeYield[0] : o.recipeYield;
  return Input.parse({
    title: typeof o.name === 'string' ? plain(o.name) : o.name,
    description: typeof o.description === 'string' ? plain(o.description) : null,
    servings: parseInt(String(yieldRaw ?? '').replace(/^\D+/, ''), 10) || null,
    minutes: isoMinutes(o.totalTime) ?? ((isoMinutes(o.prepTime) ?? 0) + (isoMinutes(o.cookTime) ?? 0) || null),
    ingredients: Array.isArray(o.recipeIngredient) ? o.recipeIngredient.map((x) => plain(String(x))).filter(Boolean) : o.recipeIngredient,
    steps: steps.map(plain).filter(Boolean),
    sourceUrl: typeof o.url === 'string' && /^https?:/.test(o.url) ? o.url : null,
    image: imageOf(o.image),
  });
}

function csvRows(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  const [head, ...rest] = rows;
  return rest.map((r) => Object.fromEntries(head.map((h, i) => [h.trim().toLowerCase(), r[i] ?? ''])));
}

/** CSV columns: title, servings, minutes, ingredients (one per line or | separated), steps (same), source_url */
export function parseImportText(text: string, fileName: string): { recipes: ImportInput[]; errors: string[] } {
  const errors: string[] = [];
  const recipes: ImportInput[] = [];
  const add = (raw: unknown, label: string) => {
    try {
      const o = raw as Record<string, unknown>;
      recipes.push(o && (isRecipe(o) || 'recipeIngredient' in o) ? fromJsonLd(o) : Input.parse(raw));
    } catch {
      errors.push(`${label}: missing a name or ingredients.`);
    }
  };
  if (/\.csv$/i.test(fileName)) {
    csvRows(text).forEach((r, i) => add({ title: r.title, servings: r.servings || null, minutes: r.minutes || null, ingredients: (r.ingredients ?? '').split(/\||\n/).map((x) => x.trim()).filter(Boolean), steps: (r.steps ?? '').split(/\||\n/).map((x) => x.trim()).filter(Boolean), sourceUrl: r.source_url || null }, `Row ${i + 2}`));
  } else {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { recipes, errors: ["That file isn't valid JSON."] };
    }
    const graph = (parsed as { '@graph'?: unknown[] })['@graph'];
    const list = Array.isArray(parsed) ? parsed : graph ?? [parsed];
    list.forEach((item, i) => add(item, `Recipe ${i + 1}`));
  }
  return { recipes, errors };
}

function isRecipe(x: unknown): x is Record<string, unknown> {
  const t = (x as { '@type'?: unknown } | null)?.['@type'];
  return t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'));
}

/** Find the schema.org Recipe that most recipe sites embed in their pages. */
export function findJsonLdRecipe(html: string): Record<string, unknown> | null {
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1].trim()) as unknown;
      const list = (Array.isArray(data) ? data : (data as { '@graph'?: unknown[] })['@graph'] ?? [data]) as unknown[];
      const hit = list.flatMap((x) => (Array.isArray(x) ? x : [x])).find(isRecipe);
      if (hit) return hit;
    } catch { /* malformed block: try the next one */ }
  }
  return null;
}

const ING_HEAD = /^(?:ingredients?|you will need|what you need)\s*:?$/i;
const STEP_HEAD = /^(?:method|instructions|directions|steps|preparation|how to make it)\s*:?$/i;
const PAGE_END = /^(?:notes?|tips?|nutrition|related|you might also|more recipes|reviews?|comments?)\b/i;

/**
 * Read a recipe copied from a web page: a title, then lines under an "Ingredients" heading,
 * then lines under a "Method" heading. Everything else on the page is ignored.
 */
export function parsePastedRecipe(text: string, sourceUrl: string | null): ImportInput | null {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const ingAt = lines.findIndex((l) => ING_HEAD.test(l));
  const stepAt = lines.findIndex((l, i) => i > ingAt && STEP_HEAD.test(l));
  if (ingAt < 0 || stepAt < 0) return null;
  const title = lines.slice(0, ingAt).find((l) => l.length > 3 && l.length < 120 && !/^(skip|menu|home|search|save|print|share)\b/i.test(l)) ?? 'Imported recipe';
  const ingredients = lines.slice(ingAt + 1, stepAt).filter((l) => l.length < 160 && !/^(serves|makes|prep|cook)\b/i.test(l));
  const after = lines.slice(stepAt + 1);
  const end = after.findIndex((l) => PAGE_END.test(l));
  const steps = (end < 0 ? after : after.slice(0, end)).map((l) => l.replace(/^(?:step\s*)?\d+[.):]?\s*/i, '')).filter((l) => l.length > 3);
  const serves = text.match(/\b(?:serves|servings?|makes)\s*:?\s*(\d+)/i);
  try {
    return Input.parse({ title, ingredients, steps, servings: serves ? +serves[1] : null, sourceUrl });
  } catch {
    return null;
  }
}

export function toRecipe(input: ImportInput): Recipe & { updatedAt: number } {
  const id = `user-${uid()}`;
  const ingredients = input.ingredients.map((l, i) => parseIngredientLine(`${id}-i${i}`, metricise(l)));
  const steps = input.steps.map((t, i) => {
    const text = metricise(t);
    return { id: `${id}-s${i}`, text, timerSeconds: extractTimers(text) };
  });
  const host = input.sourceUrl ? new URL(input.sourceUrl).hostname.replace(/^www\./, '') : null;
  const ids = [...new Set(ingredients.map((i) => i.canonicalId).filter((x): x is string => Boolean(x)))];
  const allergens = new Set<Allergen>(ids.flatMap((i) => getCanonical(i)?.allergens ?? []));
  return {
    id, title: input.title, description: input.description ?? null, completeness: steps.length ? 'complete' : 'ingredients-verified', servings: input.servings ?? 4, servingsVerified: Boolean(input.servings),
    prepMinutes: null, cookMinutes: null, totalMinutes: input.minutes ?? null, timeEstimated: false, mealTypes: classifyMealTypes(input.title, '', ids, allergens), cuisine: null, mainIngredient: null, tags: [], dietary: [], allergens: [...allergens],
    hasUnknownIngredients: ingredients.some((i) => !i.canonicalId), thermomix: 'none',
    image: input.image ? { url: input.image, credit: `Photo: ${host ?? 'source site'}`, rights: 'Shown from the original page' } : null,
    ingredients, steps, equipment: [], kidTasks: [], issues: [],
    source: { name: host ?? 'Imported by me', url: input.sourceUrl ?? null, author: null, license: 'Personal import, stored on this device only', licenseUrl: null, rights: 'user-owned', provenance: 'Imported in Love Bites', importedAt: new Date().toISOString() },
    userOwned: true, updatedAt: Date.now(),
  };
}

const READER = 'https://r.jina.ai/';

/**
 * Fetch a recipe page. Most sites block other web pages from reading them directly, so after trying
 * the page itself this goes through the Jina reader service, which only receives the link.
 */
export async function fetchRecipeFromUrl(url: string): Promise<ImportInput> {
  const attempts: (() => Promise<Response>)[] = [
    () => fetch(url, { mode: 'cors' }),
    () => fetch(READER + url, { headers: { 'X-Return-Format': 'html' } }),
  ];
  for (const attempt of attempts) {
    try {
      const res = await attempt();
      if (!res.ok) continue;
      const found = findJsonLdRecipe(await res.text());
      if (found) return { ...fromJsonLd(found), sourceUrl: url };
    } catch { /* blocked or offline: try the next route */ }
  }
  throw new Error('no-recipe');
}

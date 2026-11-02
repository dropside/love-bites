// Import recipes Ren owns or has rights to, from JSON (including schema.org Recipe) or simple CSV. Stored on this device only.
import { z } from 'zod';
import { parseIngredientLine } from '../../domain/ingredients';
import type { Recipe } from '../../domain/types';
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

/** Convert a schema.org Recipe object to our input shape. */
export function fromJsonLd(o: Record<string, unknown>): ImportInput {
  const instr = o.recipeInstructions;
  const steps = Array.isArray(instr)
    ? instr.flatMap((s) => (s && typeof s === 'object' && 'itemListElement' in s ? ((s as { itemListElement: unknown[] }).itemListElement ?? []).map(asText) : [asText(s)]))
    : typeof instr === 'string' ? instr.split(/\n+/) : [];
  const yieldRaw = Array.isArray(o.recipeYield) ? o.recipeYield[0] : o.recipeYield;
  return Input.parse({
    title: o.name,
    description: typeof o.description === 'string' ? o.description : null,
    servings: parseInt(String(yieldRaw ?? ''), 10) || null,
    minutes: isoMinutes(o.totalTime),
    ingredients: o.recipeIngredient,
    steps: steps.map((s) => s.trim()).filter(Boolean),
    sourceUrl: typeof o.url === 'string' ? o.url : null,
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
      recipes.push(o && (o['@type'] === 'Recipe' || 'recipeIngredient' in o) ? fromJsonLd(o) : Input.parse(raw));
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

export function toRecipe(input: ImportInput): Recipe & { updatedAt: number } {
  const id = `user-${uid()}`;
  const ingredients = input.ingredients.map((l, i) => parseIngredientLine(`${id}-i${i}`, l));
  const steps = input.steps.map((text, i) => ({ id: `${id}-s${i}`, text, timerSeconds: extractTimers(text) }));
  return {
    id, title: input.title, description: input.description ?? null, completeness: steps.length ? 'complete' : 'ingredients-verified', servings: input.servings ?? 4, servingsVerified: Boolean(input.servings),
    prepMinutes: null, cookMinutes: null, totalMinutes: input.minutes ?? null, timeEstimated: false, mealTypes: ['dinner', 'lunch'], cuisine: null, mainIngredient: null, tags: [], dietary: [], allergens: [],
    hasUnknownIngredients: ingredients.some((i) => !i.canonicalId), thermomix: 'none', image: null, ingredients, steps, equipment: [], kidTasks: [], issues: [],
    source: { name: 'Imported by me', url: input.sourceUrl ?? null, author: null, license: 'Personal import, stored on this device only', licenseUrl: null, rights: 'user-owned', provenance: 'Settings import', importedAt: new Date().toISOString() },
    userOwned: true, updatedAt: Date.now(),
  };
}

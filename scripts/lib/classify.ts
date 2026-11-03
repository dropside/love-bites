// Shared classification: turns parsed ingredients and steps into a validated Recipe.
import { getCanonical } from '../../src/domain/ingredients';
import type { Allergen, Completeness, Recipe, RecipeIngredient, RecipeInstruction, RecipeSource, ThermomixLevel } from '../../src/domain/types';
import { classifyMealTypes } from '../../src/domain/mealTypes';
import { convertDim, normaliseUnit } from '../../src/domain/units';

export function extractTimers(text: string): number[] {
  const out: number[] = [];
  const re = /(\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const n = parseFloat(m[2] ?? m[1]);
    const unit = m[3][0].toLowerCase();
    const secs = unit === 'h' ? n * 3600 : unit === 'm' ? n * 60 : n;
    if (secs >= 30 && secs <= 6 * 3600) out.push(Math.round(secs));
  }
  return out;
}

export function makeSteps(recipeId: string, texts: string[]): RecipeInstruction[] {
  return texts
    .map((t) => t.replace(/\s+/g, ' ').replace(/^(step\s*\d+[:.)]?|\d+[.)])\s*/i, '').trim())
    .filter((t) => t.length > 3)
    .map((text, i) => ({ id: `${recipeId}-s${i + 1}`, text, timerSeconds: extractTimers(text) }));
}

/** Split a block of instructions into steps. */
export function splitInstructions(block: string): string[] {
  const lines = block.split(/\r?\n+/).map((l) => l.trim()).filter((l) => l && !/^step\s*\d+\.?$/i.test(l));
  if (lines.length >= 2) return lines;
  const sentences = block.match(/[^.!?]+[.!?]+(\s|$)/g)?.map((s) => s.trim()) ?? [block];
  const out: string[] = [];
  for (let i = 0; i < sentences.length; i += 2) out.push(sentences.slice(i, i + 2).join(' '));
  return out;
}

const THERMOMIX_SUITED = /\b(soups?|risotto|hummus|houmous|dips?|pesto|custard|mash(ed)?|puree|purée|dough|smoothie|bechamel|béchamel|white sauce|curry paste|chowder|bisque|gazpacho|sorbet|mayonnaise|hollandaise|porridge|jam|chutney|bread|pizza base|dhal|dal)\b/i;
const QUICK_MAX = 30;


const CUISINES: [string, RegExp][] = [
  ['Italian', /\b(italian|pasta|risotto|lasagn[ae]|gnocchi|bolognese|carbonara|pizza|focaccia|minestrone|arancini|tiramisu)\b/i],
  ['Indian', /\b(indian|curry|dal|dhal|masala|tikka|korma|vindaloo|biryani|tandoori|samosa|naan|chutney)\b/i],
  ['Thai', /\b(thai|pad thai|tom yum|massaman|laksa)\b/i],
  ['Mexican', /\b(mexican|taco|burrito|enchilada|quesadilla|salsa|guacamole|fajita|nacho|chilli con carne)\b/i],
  ['Chinese', /\b(chinese|stir[- ]fry|chow mein|dumpling|wonton|kung pao|sweet and sour)\b/i],
  ['Japanese', /\b(japanese|sushi|teriyaki|ramen|udon|miso|katsu|tempura)\b/i],
  ['French', /\b(french|ratatouille|quiche|crepe|bourguignon|gratin|souffle|coq au vin)\b/i],
  ['Greek', /\b(greek|moussaka|souvlaki|tzatziki|spanakopita)\b/i],
  ['Middle Eastern', /\b(middle eastern|hummus|falafel|shawarma|tagine|lebanese|persian|turkish)\b/i],
  ['British', /\b(british|english|shepherd|cottage pie|yorkshire|bangers|fish and chips|scone)\b/i],
  ['American', /\b(american|burger|barbecue|bbq|mac and cheese|cornbread|cajun|southern)\b/i],
  ['NZ & Australian', /\b(new zealand|kiwi|australian|anzac|pavlova|lamington|hangi)\b/i],
  ['Vietnamese', /\b(vietnamese|pho|banh mi)\b/i],
  ['Korean', /\b(korean|bibimbap|kimchi|bulgogi)\b/i],
  ['Spanish', /\b(spanish|paella|tortilla espanola|gazpacho|churros)\b/i],
  ['Nigerian', /\b(nigerian|jollof|suya)\b/i],
];

export const classifyCuisine = (hay: string): string | null => CUISINES.find(([, re]) => re.test(hay))?.[0] ?? null;

const MAIN_ORDER: [string, RegExp][] = [
  ['chicken', /^chicken/], ['beef', /^beef/], ['lamb', /^lamb/], ['pork', /^(pork|bacon|ham|sausage)/],
  ['seafood', /^(salmon|white-fish|prawn|tuna|mussel)/], ['eggs', /^egg$/], ['pasta', /^(pasta|spaghetti|lasagne|noodles|tortellini|ravioli|gnocchi|macaroni|penne|fusilli|fettuccine|pasta-shells|rigatoni|orzo)/],
  ['rice', /^(rice|arborio)/], ['beans & lentils', /^(kidney|black-beans|white-beans|chickpeas|lentils|tofu)/],
  ['potato', /^(potato|sweet-potato)/], ['vegetables', /^(broccoli|cauliflower|pumpkin|eggplant|courgette|mushroom|spinach|capsicum|cabbage|carrot|tomato)/],
];

export function classifyMain(ids: string[]): string | null {
  for (const [name, re] of MAIN_ORDER) if (ids.some((i) => re.test(i))) return name;
  return null;
}

const EQUIPMENT: [string, RegExp][] = [
  ['Oven', /\boven\b/i], ['Frying pan', /\b(frying pan|skillet|fry pan)\b/i], ['Saucepan', /\b(saucepan|pot)\b/i], ['Wok', /\bwok\b/i],
  ['Blender', /\b(blender|blend)\b/i], ['Food processor', /\bfood processor\b/i], ['Slow cooker', /\b(slow cooker|crock ?pot)\b/i],
  ['Baking tray', /\b(baking (tray|sheet)|roasting tin|roasting pan)\b/i], ['Casserole dish', /\b(casserole|dutch oven)\b/i], ['Grill', /\b(grill|broiler)\b/i],
];

function kidTasks(ings: RecipeIngredient[], title: string): string[] {
  const out = new Set<string>();
  const veg = ings.find((i) => getCanonical(i.canonicalId)?.category === 'veg');
  if (veg) out.add(`Wash the ${veg.name.toLowerCase()} in cold water.`);
  const dry = ings.find((i) => ['flour', 'sugar', 'oats', 'cocoa', 'rice', 'pasta', 'macaroni', 'penne', 'fusilli', 'fettuccine', 'pasta-shells', 'rigatoni', 'orzo'].includes(i.canonicalId ?? ''));
  if (dry) out.add(`Measure the ${dry.name.toLowerCase()} into a cold bowl.`);
  if (ings.some((i) => ['basil', 'mint', 'parsley', 'coriander', 'lettuce', 'spinach'].includes(i.canonicalId ?? ''))) out.add('Tear the soft herbs or leaves by hand.');
  if (ings.some((i) => i.canonicalId === 'egg')) out.add('Crack the eggs into a separate bowl, then wash hands.');
  out.add(`Help set the table for the ${title.toLowerCase()}.`);
  return [...out].slice(0, 3);
}

export interface RecipeDraft {
  id: string;
  title: string;
  description?: string | null;
  ingredients: RecipeIngredient[];
  stepTexts: string[];
  source: RecipeSource;
  image?: Recipe['image'];
  servingsHint?: number | null;
  totalMinutesHint?: number | null;
  prepMinutesHint?: number | null;
  cookMinutesHint?: number | null;
  mealHint?: string;
  cuisineHint?: string | null;
  thermomix?: ThermomixLevel;
  tags?: string[];
  linkOnly?: boolean;
}

export function finalise(d: RecipeDraft): Recipe {
  const steps = makeSteps(d.id, d.stepTexts);
  const stepText = steps.map((s) => s.text).join(' ');
  const ids = [...new Set(d.ingredients.map((i) => i.canonicalId).filter((x): x is string => Boolean(x)))];
  const real = d.ingredients.filter((i) => !getCanonical(i.canonicalId)?.free);
  const issues: string[] = [];

  // Servings: stated or estimated, and labelled which.
  const servingsMatch = stepText.match(/\b(?:serves|servings?:?|feeds|makes)\s+(\d{1,2})\b/i);
  let servings = d.servingsHint ?? (servingsMatch ? +servingsMatch[1] : null);
  const servingsVerified = servings != null && servings > 0;
  if (!servingsVerified) {
    let grams = 0;
    for (const i of real) {
      if (i.quantity == null || !i.unit) continue;
      const n = normaliseUnit(i.quantity, i.unit);
      if (!n.dim) continue;
      const g = convertDim(n.quantity, n.dim, 'g', getCanonical(i.canonicalId));
      if (g != null) grams += g;
    }
    servings = Math.max(2, Math.min(8, Math.round(grams / 450) || 4));
    issues.push('Servings not stated by the source; estimated from ingredient weight.');
  }

  // Time: stated or estimated from the steps.
  const cookSum = steps.reduce((n, s) => n + (s.timerSeconds.length ? Math.max(...s.timerSeconds) : 0), 0);
  const timeStated = d.totalMinutesHint != null || d.cookMinutesHint != null;
  const prep = d.prepMinutesHint ?? (real.length ? Math.round((5 + real.length * 1.2) / 5) * 5 : null);
  const cook = d.cookMinutesHint ?? (cookSum ? Math.round(cookSum / 60) : null);
  const total = d.totalMinutesHint ?? (prep != null || cook != null ? (prep ?? 0) + (cook ?? 0) : null);

  const allergens = new Set<Allergen>();
  for (const i of real) for (const a of getCanonical(i.canonicalId)?.allergens ?? []) allergens.add(a);
  const unknown = real.some((i) => !i.canonicalId);
  const dietary: string[] = [];
  if (!unknown && real.length) {
    const has = (...a: Allergen[]) => a.some((x) => allergens.has(x));
    const veg = !has('meat', 'fish', 'shellfish', 'pork');
    if (veg) dietary.push('vegetarian');
    if (veg && !has('dairy', 'egg') && !ids.includes('honey')) dietary.push('vegan');
    if (!has('gluten')) dietary.push('gluten-free');
    if (!has('dairy')) dietary.push('dairy-free');
    if (!has('nuts')) dietary.push('nut-free');
  }

  const titleAndSteps = `${d.title} ${stepText}`;
  const mealTypes = classifyMealTypes(d.title, d.mealHint ?? '', ids, allergens);
  const tags = new Set(d.tags ?? []);
  if (total != null && total <= QUICK_MAX) tags.add('quick');
  if (/\b(one[- ]pot|one[- ]pan|sheet[- ]pan|tray bake|traybake|slow cooker|crock ?pot)\b/i.test(titleAndSteps)) tags.add('one-pot');
  if (/\bfreez(e|er|es|ing)\b/i.test(stepText) || /\b(soup|stew|casserole|bolognese|curry)\b/i.test(d.title)) tags.add('freezer-friendly');
  if (mealTypes.includes('baking') || /\b(bake|baked|baking)\b/i.test(d.title)) tags.add('baking');
  const stapleRatio = real.length ? real.filter((i) => getCanonical(i.canonicalId)?.category === 'pantry').length / real.length : 0;
  if (stapleRatio >= 0.6) tags.add('pantry-friendly');
  const kidOk = !allergens.has('alcohol') && !ids.some((i) => ['chilli', 'chilli-powder', 'curry-paste', 'anchovy', 'mussel'].includes(i));
  if (kidOk && real.length && !d.linkOnly && /\b(pasta|spaghetti|macaroni|chicken|pizza|meatball|burger|pancake|muffin|cookie|biscuit|cake|fried rice|omelet|omelette|soup|taco|sausage|pie|wrap|banana|cheese)\b/i.test(d.title)) {
    tags.add('kid-friendly');
  }

  const cuisine = d.cuisineHint ?? classifyCuisine(`${d.title} ${d.mealHint ?? ''}`);
  const main = classifyMain(ids);

  // Completeness is computed from what's actually there. Nothing is assumed.
  let completeness: Completeness;
  const quantified = real.filter((i) => i.quantity != null || i.flags.includes('combined-seasoning')).length;
  const canonicalRatio = real.length ? real.filter((i) => i.canonicalId).length / real.length : 0;
  const quantifiedRatio = real.length ? quantified / real.length : 0;
  if (d.linkOnly || !real.length) completeness = 'discovery-only';
  else if (canonicalRatio < 0.7 || quantifiedRatio < 0.6) {
    completeness = 'needs-review';
    if (canonicalRatio < 0.7) issues.push(`Only ${Math.round(canonicalRatio * 100)}% of ingredients were recognised.`);
    if (quantifiedRatio < 0.6) issues.push(`Only ${Math.round(quantifiedRatio * 100)}% of ingredients have quantities.`);
  } else if (!steps.length) completeness = 'ingredients-verified';
  else completeness = 'complete';

  const thermomix: ThermomixLevel = d.thermomix ?? (THERMOMIX_SUITED.test(d.title) ? 'suitable-unverified' : 'none');

  return {
    id: d.id,
    title: d.title,
    description: d.description ?? describe(d.title, cuisine, real, mealTypes),
    completeness,
    servings: servings!,
    servingsVerified,
    prepMinutes: prep,
    cookMinutes: cook,
    totalMinutes: total,
    timeEstimated: !timeStated,
    mealTypes,
    cuisine,
    mainIngredient: main,
    tags: [...tags],
    dietary,
    allergens: [...allergens],
    hasUnknownIngredients: unknown || !real.length,
    thermomix,
    image: d.image ?? null,
    ingredients: d.ingredients,
    steps,
    equipment: EQUIPMENT.filter(([, re]) => re.test(stepText)).map(([n]) => n),
    kidTasks: tags.has('kid-friendly') ? kidTasks(real, d.title) : [],
    source: d.source,
    issues,
  };
}

function describe(title: string, cuisine: string | null, ings: RecipeIngredient[], mealTypes: string[]): string | null {
  const stars = ings
    .filter((i) => i.canonicalId && !getCanonical(i.canonicalId)?.seasoning && getCanonical(i.canonicalId)?.category !== 'pantry')
    .slice(0, 3)
    .map((i) => i.name.toLowerCase());
  if (!stars.length) return null;
  const kind = mealTypes.includes('dessert') ? 'dessert' : mealTypes.includes('soup') ? 'soup' : mealTypes.includes('salad') ? 'salad' : mealTypes.includes('baking') ? 'bake' : 'dish';
  const list = stars.length > 1 ? `${stars.slice(0, -1).join(', ')} and ${stars.at(-1)}` : stars[0];
  return `${cuisine ? `${/^[AEIOU]/.test(cuisine) ? 'An' : 'A'} ${cuisine} ` : 'A '}${kind} with ${list}.`;
}

/** Normalised title key for duplicate detection. */
export function titleKey(t: string): string {
  return t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\b(the|a|an|easy|best|classic|simple|quick|homemade|recipe|thermomix|tm5|tm6|tm7|my|perfect|traditional|authentic|style)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w))
    .sort()
    .join(' ');
}

export function jaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const A = new Set(a);
  const B = new Set(b);
  let n = 0;
  for (const x of A) if (B.has(x)) n++;
  return n / (A.size + B.size - n);
}

export interface DuplicateReport {
  id: string;
  title: string;
  duplicateOf: string;
  reason: string;
}

/** Keeps the first of each duplicate. Sources should be passed in priority order. */
export function dedupe(recipes: Recipe[]): { kept: Recipe[]; duplicates: DuplicateReport[] } {
  const kept: Recipe[] = [];
  const duplicates: DuplicateReport[] = [];
  const byTitle = new Map<string, Recipe>();
  const byId = new Set<string>();
  for (const r of recipes) {
    if (byId.has(r.id)) {
      duplicates.push({ id: r.id, title: r.title, duplicateOf: r.id, reason: 'same id' });
      continue;
    }
    const key = titleKey(r.title);
    const same = byTitle.get(key);
    if (same) {
      duplicates.push({ id: r.id, title: r.title, duplicateOf: same.id, reason: 'same normalised title' });
      continue;
    }
    const ids = r.ingredients.map((i) => i.canonicalId).filter((x): x is string => Boolean(x));
    const words = new Set(key.split(' '));
    const near = kept.find((k) => {
      if (ids.length < 4) return false;
      const kw = titleKey(k.title).split(' ');
      const overlap = kw.filter((w) => words.has(w)).length / Math.max(kw.length, words.size);
      if (overlap < 0.5) return false;
      return jaccard(ids, k.ingredients.map((i) => i.canonicalId ?? '')) >= 0.75;
    });
    if (near) {
      duplicates.push({ id: r.id, title: r.title, duplicateOf: near.id, reason: 'similar title and ingredients' });
      continue;
    }
    byTitle.set(key, r);
    byId.add(r.id);
    kept.push(r);
  }
  return { kept, duplicates };
}

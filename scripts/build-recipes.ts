// Normalises every source into data/catalog/recipes.json. Personal data is unaffected: IDs are stable per source.
// Run: npm run data:recipes
import { readdirSync } from 'node:fs';
import { parseIngredientLine, parseMeasuredIngredient } from '../src/domain/ingredients';
import type { Recipe, RecipeIngredient, RecipeSource } from '../src/domain/types';
import { dedupe, finalise, splitInstructions, type DuplicateReport, type RecipeDraft } from './lib/classify';
import { exists, path, readJson, slug, writeJson } from './lib/common';

interface MealDbMeal {
  idMeal: string;
  strMeal: string;
  strCategory: string | null;
  strArea: string | null;
  strCountry?: string | null;
  strInstructions: string | null;
  strMealThumb: string | null;
  strTags: string | null;
  strSource: string | null;
  [k: string]: unknown;
}

const COUNTRY: Record<string, string> = {
  Brazil: 'Brazilian', Italy: 'Italian', France: 'French', India: 'Indian', China: 'Chinese', Japan: 'Japanese', Mexico: 'Mexican', Thailand: 'Thai', Greece: 'Greek',
  Spain: 'Spanish', Turkey: 'Turkish', Vietnam: 'Vietnamese', Morocco: 'Moroccan', 'United Kingdom': 'British', 'United States': 'American', Ireland: 'Irish',
  Canada: 'Canadian', Jamaica: 'Jamaican', Egypt: 'Egyptian', Malaysia: 'Malaysian', Portugal: 'Portuguese', Poland: 'Polish', Russia: 'Russian', Netherlands: 'Dutch',
  Croatia: 'Croatian', Tunisia: 'Tunisian', Kenya: 'Kenyan', Philippines: 'Filipino', Ukraine: 'Ukrainian', Uruguay: 'Uruguayan', Syria: 'Syrian', Argentina: 'Argentinian',
  Cambodia: 'Cambodian', Estonia: 'Estonian', Albania: 'Albanian', Laos: 'Lao', Afghanistan: 'Afghan', Azerbaijan: 'Azerbaijani', Angola: 'Angolan', Botswana: 'Botswanan', 'Costa Rica': 'Costa Rican', Bahamas: 'Bahamian', Barbados: 'Bajan', Dominica: 'Caribbean', Aruba: 'Caribbean', 'Cayman Islands': 'Caribbean', 'Antigua and Barbuda': 'Caribbean', Andorra: 'Catalan',
  Colombia: 'Colombian', Peru: 'Peruvian', Algeria: 'Algerian', Ethiopia: 'Ethiopian', Nigeria: 'Nigerian', Ghana: 'Ghanaian', 'South Africa': 'South African', Indonesia: 'Indonesian', Korea: 'Korean', 'South Korea': 'Korean', Germany: 'German', Austria: 'Austrian', Hungary: 'Hungarian', Sweden: 'Swedish', Norway: 'Norwegian', Denmark: 'Danish', Finland: 'Finnish', Lebanon: 'Lebanese', Israel: 'Israeli', Iran: 'Persian', Iraq: 'Iraqi', Pakistan: 'Pakistani', Bangladesh: 'Bangladeshi', 'Sri Lanka': 'Sri Lankan', Nepal: 'Nepalese', Cuba: 'Cuban', Chile: 'Chilean', Venezuela: 'Venezuelan', Belgium: 'Belgian', Switzerland: 'Swiss', Scotland: 'Scottish', Wales: 'Welsh', England: 'British', Romania: 'Romanian', Bulgaria: 'Bulgarian', Serbia: 'Serbian', Georgia: 'Georgian', Armenia: 'Armenian', Slovakia: 'Slovak', 'Saudi Arabia': 'Saudi',
  Australia: 'NZ & Australian', 'New Zealand': 'NZ & Australian', Unknown: '',
};
const cuisineFrom = (area: string | null | undefined, country: string | null | undefined) => {
  const raw = area && area !== 'Unknown' ? area : country;
  if (!raw) return null;
  if (raw === 'Australian') return 'NZ & Australian';
  return COUNTRY[raw] || raw;
};

function fromMealDb(): RecipeDraft[] {
  const { meals, fetchedAt } = readJson<{ meals: MealDbMeal[]; fetchedAt: string }>(path('data/raw/mealdb.json'));
  return meals.map((m) => {
    const id = `mealdb-${m.idMeal}`;
    const ingredients: RecipeIngredient[] = [];
    for (let i = 1; i <= 20; i++) {
      const name = String(m[`strIngredient${i}`] ?? '').trim();
      if (!name) continue;
      ingredients.push(parseMeasuredIngredient(`${id}-i${i}`, String(m[`strMeasure${i}`] ?? '').trim(), name));
    }
    const source: RecipeSource = {
      name: 'TheMealDB',
      url: `https://www.themealdb.com/meal/${m.idMeal}`,
      author: m.strSource || null,
      license: 'TheMealDB API terms (content from official endpoints may be copied and modified; credit TheMealDB)',
      licenseUrl: 'https://www.themealdb.com/terms_of_use.php',
      rights: 'full-text',
      provenance: 'API search.php',
      importedAt: fetchedAt,
    };
    const cat = m.strCategory ?? '';
    return {
      id,
      title: m.strMeal.trim(),
      ingredients,
      stepTexts: splitInstructions(m.strInstructions ?? ''),
      source,
      image: m.strMealThumb ? { url: `${m.strMealThumb}/medium`, credit: 'Photo: TheMealDB', rights: 'TheMealDB API terms' } : null,
      mealHint: `${cat} ${/^(Side|Starter|Dessert|Breakfast)$/.test(cat) ? cat : ''}`,
      cuisineHint: cuisineFrom(m.strArea, m.strCountry),
      tags: (m.strTags ?? '').split(',').map((t) => t.trim().toLowerCase()).filter((t) => /^(baking|soup|bbq|curry|stew|pasta|dessert)$/.test(t)),
    };
  });
}

interface WikibooksRow {
  recipe_data: {
    url: string;
    title: string;
    infobox: null | { category: string | null; servings: string | number | null; time: string | null; difficulty: number | null };
    text_lines: { text: string; line_type: string; section: string | null }[];
  };
}

function parseTimeText(t: string | null): number | null {
  if (!t) return null;
  let m = t.match(/(\d+(?:\.\d+)?)\s*(?:-|–|to)?\s*(?:\d+)?\s*h/i);
  let min = m ? parseFloat(m[1]) * 60 : 0;
  m = t.match(/(\d+)\s*(?:-|–|to)?\s*(?:\d+)?\s*min/i);
  if (m) min += +m[1];
  return min || null;
}

const WB_SKIP = /\b(introduction|basics|techniques|equipment|list of|substitutions?|category|table of|history)\b/i;
const WB_STEP_SECTION = /(procedure|direction|method|preparation|instruction|steps)/i;

function fromWikibooks(stats: Record<string, number>): RecipeDraft[] {
  const rows = readJson<WikibooksRow[]>(path('data/raw/wikibooks.json'));
  const out: RecipeDraft[] = [];
  for (const { recipe_data: r } of rows) {
    const title = r.title.replace(/^Cookbook:/, '').replace(/_/g, ' ').trim();
    if (WB_SKIP.test(title) || title.includes('/')) {
      stats.wbSkippedNonRecipe++;
      continue;
    }
    const id = `wb-${slug(title)}`;
    const ingLines = r.text_lines.filter((l) => l.text.trim().length > 2 && l.section && /ingredient/i.test(l.section) && (l.line_type === 'ul' || l.line_type === 'ol'));
    const steps = r.text_lines.filter((l) => l.section && WB_STEP_SECTION.test(l.section) && (l.line_type === 'ol' || l.line_type === 'ul' || l.line_type === 'p'));
    if (ingLines.length < 3 || steps.length < 2) {
      stats.wbRejectedStructure++;
      continue;
    }
    const ingredients = ingLines.map((l, i) => parseIngredientLine(`${id}-i${i + 1}`, l.text, /^ingredients?$/i.test(l.section ?? '') ? null : l.section));
    const known = ingredients.filter((i) => i.canonicalId).length / ingredients.length;
    const quant = ingredients.filter((i) => i.quantity != null).length / ingredients.length;
    // Only keep recipes usable for shopping: common ingredients with real amounts.
    if (known < 0.9 || quant < 0.85 || ingredients.length < 4 || steps.length < 3 || /^['"d]/.test(title)) {
      stats.wbRejectedQuality++;
      continue;
    }
    const intro = r.text_lines.find((l) => l.line_type === 'p' && !l.section && l.text.length > 40 && l.text.length < 400)?.text ?? null;
    const servingsRaw = r.infobox?.servings != null ? parseInt(String(r.infobox?.servings), 10) : NaN;
    out.push({
      id,
      title,
      description: intro,
      ingredients,
      stepTexts: steps.map((s) => s.text),
      source: {
        name: 'Wikibooks Cookbook',
        url: r.url,
        author: 'Wikibooks contributors',
        license: 'CC BY-SA 4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
        rights: 'full-text',
        provenance: 'gossminn/wikibooks-cookbook dump, 2024-07',
        importedAt: '2026-11-02T00:00:00.000Z',
      },
      servingsHint: Number.isFinite(servingsRaw) && servingsRaw > 0 && servingsRaw <= 40 ? servingsRaw : null,
      totalMinutesHint: parseTimeText(r.infobox?.time ?? null),
      mealHint: (r.infobox?.category ?? '').replace('/wiki/Category:', '').replace(/_/g, ' '),
    });
  }
  return out;
}

const NOT_RECIPE = /\b(meal plan|you know you|giveaway|review|ebook|e-book|competition|winner|tips|tricks|how to|faq|guide|about|week in|christmas gift|gift ideas|thermomix demo|news|update|announcement|sale|podcast|cookbook|bundle|what is|why|top \d+|\d+ (best|easy|ways)|hacks|menu plan|meal planning|shopping list|cleaning|consultant|facebook|instagram|welcome|thank|survey|party|free printable|printable)\b/i;
const FOODY = /\b(soup|chicken|beef|lamb|pork|cake|bread|sauce|salad|curry|pasta|risotto|dip|cookies?|biscuits?|slice|muffins?|pizza|tart|pie|rice|jam|fudge|dressing|butter|ice cream|custard|pudding|porridge|smoothie|granola|fish|salmon|prawn|mash|stew|casserole|bolognese|meatballs?|rolls?|buns?|pancakes?|scones?|laksa|hummus|pesto|chutney|relish|balls|bars|brownies?|cheesecake|lasagne|lasagna|quiche|frittata|omelette|falafel|tacos?|nachos|mousse|sorbet|paste|stock|mayonnaise|gravy|kahlua|cordial|lemonade|chocolate|lemon|banana|apple|pumpkin|potato|broccoli|cauliflower|tomato|garlic)\b/i;

function linkTitle(url: string): string | null {
  const s = new URL(url).pathname.split('/').filter(Boolean).pop() ?? '';
  const words = s
    .replace(/thermofun|thermobliss|thermomix|tm5|tm6|tm7|recipes?|thirsty-thursday|week-?\d+(-\d{4})?|-\d{4}$|^\d+-/gi, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (words.length < 4 || NOT_RECIPE.test(`${words} ${s.replace(/-/g, ' ')}`) || !FOODY.test(words)) return null;
  return words.split(' ').map((w) => (w.length > 2 || /^[a-z]/.test(w) ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');
}

function fromThermomixLinks(stats: Record<string, number>): RecipeDraft[] {
  const { links, fetchedAt } = readJson<{ links: { site: string; url: string }[]; fetchedAt: string }>(path('data/raw/thermomix-links.json'));
  const out: RecipeDraft[] = [];
  for (const { site, url } of links) {
    const title = linkTitle(url);
    if (!title) {
      stats.thermomixLinksSkipped++;
      continue;
    }
    const name = site === 'thermobliss.com' ? 'ThermoBliss' : 'ThermoFun';
    out.push({
      id: `tmx-${slug(site.split('.')[0])}-${slug(title)}`,
      title,
      description: `A Thermomix recipe from ${name}. Ingredients and steps live on the original site.`,
      ingredients: [],
      stepTexts: [],
      source: {
        name,
        url,
        author: name,
        license: 'All rights reserved by the author: link only',
        licenseUrl: null,
        rights: 'link-only',
        provenance: 'Public sitemap title and link only',
        importedAt: fetchedAt,
      },
      thermomix: 'native-source',
      linkOnly: true,
    });
  }
  return out;
}

function fromImports(): RecipeDraft[] {
  const dir = path('data/imports');
  if (!exists(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .flatMap((f) => readJson<RecipeDraft[]>(`${dir}/${f}`));
}

const stats: Record<string, number> = { wbSkippedNonRecipe: 0, wbRejectedStructure: 0, wbRejectedQuality: 0, thermomixLinksSkipped: 0 };
const drafts = [...fromImports(), ...fromMealDb(), ...fromWikibooks(stats), ...fromThermomixLinks(stats)];
const all: Recipe[] = drafts.map(finalise);
const { kept, duplicates } = dedupe(all);

writeJson(path('data/catalog/recipes.json'), kept);
writeJson(path('data/catalog/import-log.json'), { generatedAt: new Date().toISOString(), candidates: all.length, kept: kept.length, stats, duplicates: duplicates as DuplicateReport[] }, true);
console.log(`Candidates ${all.length}; kept ${kept.length}; duplicates ${duplicates.length}`, stats);

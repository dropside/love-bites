// Meal type rules shared by the catalogue build and in-app imports, so both classify a recipe the same way.
import type { Allergen } from './types';

const MEAL_KEYWORDS: [string, RegExp][] = [
  ['dessert', /\b(dessert|cakes?|tarts?|pudding|pies?|cookies?|biscuits?|brownies?|ice cream|mousse|cheesecake|pancakes?|crumble|muffins?|custard|meringue|pavlova|trifle|fudge|sorbet|icing|frosting|jam|marmalade|preserves?|toffee|caramels?|candy|candies|truffles|doughnuts?|donuts?|koeksisters|pastr(y|ies)|sweets|cupcakes?|slices?|shortbread|macarons?|baklava)\b/i],
  ['breakfast', /\b(breakfast|omelet|omelette|porridge|granola|french toast|scrambled|frittata|shakshuka)\b/i],
  ['soup', /\b(soup|chowder|bisque|broth|gazpacho)\b/i],
  ['salad', /\bsalad\b/i],
  ['side', /\b(side|mash|coleslaw|roast potatoes|chips|rice pilaf|yorkshire puddings?)\b/i],
  ['snack', /\b(snack|dips?|hummus|crackers|bars?|appetizer|appetiser|starter|canape)\b/i],
  ['drink', /\b(smoothie|cocktail|drink|lemonade|punch|tea|coffee|milkshake|liqueur|kahlua)\b/i],
  ['sauce', /\b(sauce|dressing|gravy|chutney|relish|pesto|marinade|condiment|glaze|syrup|chimichurri|aioli|mayonnaise|vinaigrette|seasoning|spice mix|batter|croutons|stock)\b/i],
  ['baking', /\b(bread|loaf|scones?|rolls|buns|muffins?|cakes?|cupcakes?|cookies?|biscuits?|focaccia|pizza dough|flatbreads?|cornbread|oatcakes?|naan|bagels?|pretzels?|tortillas?|piadina|pita|icing|frosting|shortbread)\b/i],
];

// A savoury main is the only thing that earns "dinner": protein, or a recognisable main-dish word.
const SAVOURY_MAIN = /\b(chicken|beef|pork|lamb|goat|mutton|veal|venison|duck|turkey|fish|salmon|tuna|cod|snapper|prawns?|shrimps?|mussels?|squid|crab|sausages?|bacon|ham|mince|meatballs?|meatloa(f|ves)|steak|curry|stew|casserole|pasta|spaghetti|lasagn[ae]|noodles?|ramen|risotto|paella|jambalaya|biryani|pilaf|fried rice|rice and (beans|peas)|stir[- ]?fry|burgers?|tacos?|burritos?|enchiladas?|fajitas?|quesadillas?|pizza|pie|patt(y|ies)|tofu|tempeh|lentils?|dhal|dal|chickpeas?|beans|chilli|chili|roast|bake|gratin|gozleme|g[öo]zleme|wraps?|dumplings?|gnocchi|frittata|quiche|kebabs?|souvlaki|schnitzel|katsu|teriyaki|satay|tagine|goulash|ragu|bolognese|carbonara|callaloo|croquetas|cabbage|macaroni|mac and cheese|stuffed|souffl[eé]s?|boil|poutine|moussaka|empanadas?|b[öo]rek)\b/i;
const MEAT_ALLERGENS = new Set<Allergen>(['meat', 'fish', 'shellfish', 'pork']);
const SWEET = new Set(['sugar', 'brown-sugar', 'icing-sugar', 'caster-sugar', 'honey', 'maple-syrup', 'golden-syrup', 'chocolate', 'cocoa', 'condensed-milk', 'jam']);

export function classifyMealTypes(title: string, hint: string, ids: string[] = [], allergens: Set<Allergen> = new Set()): string[] {
  const hay = `${title} ${hint}`;
  const hasMeat = [...allergens].some((a) => MEAT_ALLERGENS.has(a));
  // "Barbecue Sauce", "Chicken Marinade", "Chimichurri": the recipe is the sauce. "Prawns with romesco sauce" is a main.
  const core = title.replace(/\([^)]*\)/g, '').trim();
  if (/\b(sauces?|marinade|dressing|gravy|rub|seasoning|chimichurri|salsa|aioli|mayonnaise|vinaigrette|stock|glaze|jams?|icing|frosting)$/i.test(core) && !/\b(with|in|and)\b/i.test(core)) {
    return /\b(icing|frosting)$/i.test(core) ? ['baking', 'dessert'] : ['sauce'];
  }
  let out = MEAL_KEYWORDS.filter(([, re]) => re.test(hay)).map(([k]) => k);
  // "Chicken pie", "steak pudding", "honey-glazed pork": savoury mains, whatever the dessert-ish word says.
  if (/\b(chicken|beef|pork|lamb|steak|mince|fish|salmon|prawns?|shrimp|sausages?|bacon|meatballs?)\b/i.test(title)) out = out.filter((m) => m !== 'dessert' && m !== 'sauce' && m !== 'baking');
  const notMain = ['dessert', 'breakfast', 'snack', 'drink', 'sauce', 'side', 'baking'];
  if (out.some((m) => notMain.includes(m))) return out;
  const sweet = ids.filter((i) => SWEET.has(i)).length;
  const savoury = hasMeat || SAVOURY_MAIN.test(hay) || /\b(soup|salad)\b/.test(out.join(' '));
  if (savoury) return [...out, 'dinner', 'lunch'];
  if (sweet >= 1 && !ids.some((i) => ['onion', 'garlic', 'shallot', 'leek'].includes(i))) return [...out, 'dessert'];
  // Vegetable mains without a telling title: onion or garlic plus a few other things usually means a meal.
  if (ids.length >= 4 && ids.some((i) => ['onion', 'garlic', 'shallot', 'leek', 'tomato', 'potato'].includes(i))) return [...out, 'dinner', 'lunch'];
  return out.length ? out : ['other'];
}

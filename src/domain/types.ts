// Core domain model. Pure types: shared by the app and the data pipeline scripts.

export const CATALOG_SCHEMA_VERSION = 1;

export type Cents = number;
export type Dim = 'g' | 'ml' | 'each';

export type Completeness = 'complete' | 'ingredients-verified' | 'discovery-only' | 'needs-review';
export type ThermomixLevel = 'native-source' | 'suitable-unverified' | 'none';
export type Allergen = 'meat' | 'fish' | 'shellfish' | 'dairy' | 'egg' | 'gluten' | 'nuts' | 'soy' | 'sesame' | 'alcohol' | 'pork';
export type ShopCategory = 'veg' | 'meat' | 'dairy' | 'bakery' | 'pantry' | 'frozen' | 'household' | 'other';
export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface RecipeSource {
  name: string;
  url: string | null;
  author: string | null;
  license: string;
  licenseUrl: string | null;
  /** full-text: stored in full. link-only: title + link. user-owned: Ren's own. */
  rights: 'full-text' | 'link-only' | 'user-owned';
  provenance: string;
  importedAt: string;
}

export interface RecipeImage {
  url: string;
  credit: string;
  rights: string;
}

export interface RecipeIngredient {
  id: string;
  original: string;
  canonicalId: string | null;
  name: string;
  quantity: number | null;
  /** Upper bound for ranges like "2-3". */
  quantityMax?: number | null;
  /** Normalised unit: g, ml, each, or a named vague measure such as bunch. */
  unit: string | null;
  prep: string | null;
  optional: boolean;
  /** Should not scale linearly (salt, pepper, to taste). */
  noScale: boolean;
  confidence: number;
  flags: string[];
  /** Group within the recipe, e.g. "Sauce". */
  section?: string | null;
}

export interface ThermomixSettings {
  tempC: number | 'varoma' | null;
  timeSec: number | null;
  speed: string | null;
  reverse: boolean;
  accessories: string[];
  mode: string | null;
  models: ('TM5' | 'TM6' | 'TM7' | 'generic')[];
  /** Only true when entered from a verified native source or checked by a person. */
  verified: boolean;
}

export interface RecipeInstruction {
  id: string;
  text: string;
  timerSeconds: number[];
  thermomix?: ThermomixSettings;
}

export interface Recipe {
  id: string;
  title: string;
  description: string | null;
  completeness: Completeness;
  servings: number;
  servingsVerified: boolean;
  prepMinutes: number | null;
  cookMinutes: number | null;
  totalMinutes: number | null;
  timeEstimated: boolean;
  mealTypes: string[];
  cuisine: string | null;
  mainIngredient: string | null;
  tags: string[];
  dietary: string[];
  allergens: Allergen[];
  /** Has ingredients we could not identify; dietary claims cannot be trusted. */
  hasUnknownIngredients: boolean;
  thermomix: ThermomixLevel;
  image: RecipeImage | null;
  ingredients: RecipeIngredient[];
  steps: RecipeInstruction[];
  equipment: string[];
  kidTasks: string[];
  source: RecipeSource;
  issues: string[];
  userOwned?: boolean;
  basedOn?: string | null;
}

/** Light entry bundled in the index: everything Discover needs without the full text. */
export interface RecipeSummary {
  id: string;
  c: number; // chunk number, -1 when user owned
  title: string;
  description: string | null;
  completeness: Completeness;
  servings: number;
  servingsVerified: boolean;
  totalMinutes: number | null;
  cookMinutes: number | null;
  prepMinutes: number | null;
  timeEstimated: boolean;
  mealTypes: string[];
  cuisine: string | null;
  mainIngredient: string | null;
  tags: string[];
  dietary: string[];
  allergens: Allergen[];
  hasUnknownIngredients: boolean;
  thermomix: ThermomixLevel;
  image: string | null;
  sourceName: string;
  sourceUrl: string | null;
  ingredientIds: string[];
  /** Pricing computed at build time. null when too little was priced to be honest. */
  valueCents: Cents | null;
  checkoutCents: Cents | null;
  pricedRatio: number;
  specials: number;
}

export interface CanonicalIngredient {
  id: string;
  name: string;
  aliases: string[];
  category: ShopCategory;
  /** grams per millilitre, only where known. */
  density?: number;
  /** grams for one typical item. */
  eachGrams?: number;
  /** Grams in one shelf item where that differs from a recipe item (a garlic bulb vs a clove). */
  shelfEachGrams?: number;
  allergens?: Allergen[];
  /** Salt-style seasoning: does not scale linearly. */
  seasoning?: boolean;
  /** Commonly kept at home; treated as a household staple by default. */
  staple?: boolean;
  /** Not something you buy, e.g. water. */
  free?: boolean;
  /** Product search: alternatives, each a space-separated token list. */
  query: string[];
  exclude?: string[];
  departments?: string[];
  substitutes?: string[];
}

export type PriceStatus = 'current' | 'recent' | 'stale' | 'unknown';

export interface Product {
  id: string; // SKU
  name: string;
  brand: string | null;
  dept: string;
  packQty: number | null;
  packDim: Dim | null;
  /** Sold by weight at the shelf. priceCents is then per kg. */
  variable: boolean;
  /** Average weight in grams per item, for variable-weight items sold loose. */
  avgGrams: number | null;
  priceCents: Cents | null;
  wasCents: Cents | null;
  clubCents: Cents | null;
  special: boolean;
  unitPriceCents: Cents | null;
  unitPriceMeasure: string | null;
  slug: string;
}

export interface ProductCatalogMeta {
  schemaVersion: number;
  source: string;
  sourceUrl: string;
  sourceLicense: string;
  observedAt: string;
  importedAt: string;
  storeContext: string;
  productCount: number;
}

/** canonicalId -> ranked candidates. */
export interface ProductMatchEntry {
  productId: string;
  confidence: number;
}
export type MatchTable = Record<string, ProductMatchEntry[]>;

export interface CatalogManifest {
  schemaVersion: number;
  generatedAt: string;
  recipeCount: number;
  chunks: number;
  products: ProductCatalogMeta | null;
}

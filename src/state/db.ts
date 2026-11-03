// Personal data lives here, in IndexedDB, and is completely separate from the static catalogue.
// Schema changes must add a new version: never delete a store or wipe data on upgrade.
import Dexie, { type Table } from 'dexie';
import type { Allergen, Dim, MealSlot, Recipe } from '../domain/types';

export type SwipeAction = 'love' | 'pass' | 'save';
export type PantryLocation = 'pantry' | 'fridge' | 'freezer';

export interface SwipeRow { recipeId: string; action: SwipeAction; at: number; }

export interface CookbookRow {
  recipeId: string;
  addedAt: number;
  saved: boolean;
  favourite: boolean;
  wantToTry: boolean;
  familyFavourite: boolean;
  archived: boolean;
  lastCookedAt: number | null;
  cookCount: number;
  collectionIds: string[];
}

export interface CollectionRow { id: string; name: string; createdAt: number; }
export interface RatingRow { id: string; recipeId: string; stars: number | null; note: string; at: number; }

export interface MealEntryRow {
  id: string;
  weekStart: string;
  day: number; // 0 = Monday
  slot: MealSlot;
  recipeId: string;
  servings: number;
  note: string;
  cooked: boolean;
}

export interface ShoppingSessionRow {
  id: string;
  status: 'active' | 'complete';
  weekStart: string | null;
  startedAt: number;
  completedAt: number | null;
  /** Snapshot taken at completion, for history. */
  totalCents: number | null;
}

export interface ShopExtraRow { id: string; sessionId: string; recipeId: string; title: string; servings: number; }

export interface ShopLineStateRow {
  id: string; // sessionId|lineKey
  sessionId: string;
  checked: boolean;
  checkedAt: number | null;
  unavailable: boolean;
  countOverride: number | null;
  actualCents: number | null;
  removed: boolean;
}

export interface ManualItemRow {
  id: string;
  sessionId: string;
  name: string;
  category: string;
  estCents: number | null;
  checked: boolean;
  checkedAt: number | null;
}

export interface PantryRow {
  id: string;
  canonicalId: string | null;
  name: string;
  quantity: number | null;
  dim: Dim | null;
  staple: boolean;
  expiry: string | null;
  location: PantryLocation;
  lowAt: number | null;
  addedAt: number;
}

export interface PantryLogRow { id: string; pantryId: string; name: string; delta: number; dim: Dim | null; reason: string; at: number; undone: boolean; }
export interface ProductChoiceRow { canonicalId: string; productId: string; at: number; }
export interface UserRecipeRow extends Recipe { updatedAt: number; }

export interface CookingSessionRow {
  recipeId: string;
  stepIndex: number;
  done: number[];
  servings: number;
  timers: { id: string; label: string; total: number; endsAt: number | null; remaining: number }[];
  updatedAt: number;
}

export interface Household {
  defaultServings: number;
  preferredMeals: string[];
  dislikedIds: string[];
  dietary: string[];
  allergies: Allergen[];
  maxMinutes: number | null;
  weeklyBudgetCents: number | null;
  dinnerBudgetCents: number | null;
  maxPerServeCents: number | null;
  mealsPerWeek: number;
  store: string;
  preferredBrands: string[];
  stapleIds: string[];
  showBreakfastSnacks: boolean;
  categoryOrder: string[];
}

export const DEFAULT_CATEGORY_ORDER = ['veg', 'bakery', 'meat', 'dairy', 'pantry', 'frozen', 'household', 'other'];

export const defaultHousehold = (stapleIds: string[] = []): Household => ({
  defaultServings: 4,
  preferredMeals: [],
  dislikedIds: [],
  dietary: [],
  allergies: [],
  maxMinutes: null,
  weeklyBudgetCents: null,
  dinnerBudgetCents: null,
  maxPerServeCents: null,
  mealsPerWeek: 5,
  store: '',
  preferredBrands: [],
  stapleIds,
  showBreakfastSnacks: false,
  categoryOrder: DEFAULT_CATEGORY_ORDER,
});

export interface SettingRow { key: string; value: unknown; }

export const DB_SCHEMA_VERSION = 2;

export class LoveBitesDB extends Dexie {
  swipes!: Table<SwipeRow, string>;
  cookbook!: Table<CookbookRow, string>;
  collections!: Table<CollectionRow, string>;
  ratings!: Table<RatingRow, string>;
  meals!: Table<MealEntryRow, string>;
  sessions!: Table<ShoppingSessionRow, string>;
  shopExtras!: Table<ShopExtraRow, string>;
  shopLines!: Table<ShopLineStateRow, string>;
  manualItems!: Table<ManualItemRow, string>;
  pantry!: Table<PantryRow, string>;
  pantryLog!: Table<PantryLogRow, string>;
  productChoices!: Table<ProductChoiceRow, string>;
  userRecipes!: Table<UserRecipeRow, string>;
  cooking!: Table<CookingSessionRow, string>;
  settings!: Table<SettingRow, string>;

  constructor(name = 'love-bites') {
    super(name);
    this.version(1).stores({
      swipes: 'recipeId, action, at',
      cookbook: 'recipeId, addedAt, lastCookedAt',
      collections: 'id',
      ratings: 'id, recipeId, at',
      meals: 'id, weekStart, recipeId',
      sessions: 'id, status',
      shopExtras: 'id, sessionId',
      shopLines: 'id, sessionId',
      manualItems: 'id, sessionId',
      pantry: 'id, canonicalId',
      pantryLog: 'id, at',
      userRecipes: 'id',
      cooking: 'recipeId',
      settings: 'key',
    });
    // v2: remembered product choices. Old rows gain a default so nothing is lost.
    this.version(2)
      .stores({ productChoices: 'canonicalId' })
      .upgrade(async (tx) => {
        await tx.table('cookbook').toCollection().modify((row: CookbookRow) => {
          row.familyFavourite ??= false;
          row.collectionIds ??= [];
        });
      });
  }
}

export const db = new LoveBitesDB();

export const uid = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export async function getHousehold(): Promise<Household> {
  const row = await db.settings.get('household');
  return { ...defaultHousehold(), ...((row?.value as Partial<Household>) ?? {}) };
}

export async function saveHousehold(patch: Partial<Household>) {
  const current = await getHousehold();
  await db.settings.put({ key: 'household', value: { ...current, ...patch } });
}

/** Staples Ren has said she's out of: bought this shop instead of assumed at home. Cleared when a shop is finished. */
export async function setBuyStaple(canonicalId: string, buy: boolean) {
  const row = await db.settings.get('buyStaples');
  const current = new Set((row?.value as string[] | undefined) ?? []);
  if (buy) current.add(canonicalId);
  else current.delete(canonicalId);
  await db.settings.put({ key: 'buyStaples', value: [...current] });
}

export const emptyCookbookRow =(recipeId: string): CookbookRow => ({
  recipeId, addedAt: Date.now(), saved: false, favourite: false, wantToTry: false, familyFavourite: false, archived: false, lastCookedAt: null, cookCount: 0, collectionIds: [],
});

export async function patchCookbook(recipeId: string, patch: Partial<CookbookRow>) {
  const row = (await db.cookbook.get(recipeId)) ?? emptyCookbookRow(recipeId);
  await db.cookbook.put({ ...row, ...patch });
}

export async function activeSession(): Promise<ShoppingSessionRow> {
  const found = await db.sessions.where('status').equals('active').first();
  if (found) return found;
  const row: ShoppingSessionRow = { id: uid(), status: 'active', weekStart: null, startedAt: Date.now(), completedAt: null, totalCents: null };
  await db.sessions.put(row);
  return row;
}

/** Monday of the week containing `d`, as YYYY-MM-DD in local time. */
export function weekStartOf(d = new Date()): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return isoDate(x);
}

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDays(iso: string, n: number): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d + n);
}

import type { MealSlot } from '../../domain/types';
import { db, uid, type MealEntryRow } from '../../state/db';

export async function addMeal(weekStart: string, day: number, slot: MealSlot, recipeId: string, servings: number): Promise<string> {
  const id = uid();
  await db.meals.put({ id, weekStart, day, slot, recipeId, servings, note: '', cooked: false });
  return id;
}

export async function moveMeal(id: string, day: number, slot: MealSlot) {
  await db.meals.update(id, { day, slot });
}

export async function duplicateMeal(m: MealEntryRow, day: number, slot: MealSlot) {
  await db.meals.put({ ...m, id: uid(), day, slot, cooked: false });
}

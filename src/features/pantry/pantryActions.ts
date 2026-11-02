// Pantry changes are explicit and logged, so every deduction can be reversed.
import { getCanonical } from '../../domain/ingredients';
import type { Recipe } from '../../domain/types';
import { convertDim, normaliseUnit } from '../../domain/units';
import { db, uid } from '../../state/db';

/** Deduct a cooked recipe from the pantry. Returns log IDs so it can be undone. */
export async function deductRecipe(recipe: Recipe, servings: number): Promise<string[]> {
  const factor = servings / (recipe.servings || servings);
  const logIds: string[] = [];
  await db.transaction('rw', db.pantry, db.pantryLog, async () => {
    for (const ing of recipe.ingredients) {
      if (!ing.canonicalId || ing.quantity == null || !ing.unit) continue;
      const n = normaliseUnit(ing.quantity * (ing.noScale ? 1 : factor), ing.unit);
      if (!n.dim) continue;
      const item = await db.pantry.where('canonicalId').equals(ing.canonicalId).first();
      if (!item || item.staple || item.quantity == null || !item.dim) continue;
      const amount = convertDim(n.quantity, n.dim, item.dim, getCanonical(ing.canonicalId));
      if (amount == null) continue;
      const used = Math.min(amount, item.quantity);
      if (used <= 0) continue;
      await db.pantry.update(item.id, { quantity: +(item.quantity - used).toFixed(2) });
      const id = uid();
      await db.pantryLog.put({ id, pantryId: item.id, name: item.name, delta: -used, dim: item.dim, reason: `Cooked ${recipe.title}`, at: Date.now(), undone: false });
      logIds.push(id);
    }
  });
  return logIds;
}

export async function undoLog(ids: string[]) {
  await db.transaction('rw', db.pantry, db.pantryLog, async () => {
    for (const id of ids) {
      const log = await db.pantryLog.get(id);
      if (!log || log.undone) continue;
      const item = await db.pantry.get(log.pantryId);
      if (item?.quantity != null) await db.pantry.update(item.id, { quantity: +(item.quantity - log.delta).toFixed(2) });
      await db.pantryLog.update(id, { undone: true });
    }
  });
}

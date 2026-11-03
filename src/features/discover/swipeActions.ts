// Swipes persist in IndexedDB. Undo restores swipe and cookbook state exactly.
import { db, emptyCookbookRow, type CookbookRow, type SwipeAction } from '../../state/db';

export async function recordSwipe(recipeId: string, action: SwipeAction): Promise<void> {
  await db.transaction('rw', db.swipes, db.cookbook, db.settings, async () => {
    const prevSwipe = (await db.swipes.get(recipeId)) ?? null;
    const prevBook = (await db.cookbook.get(recipeId)) ?? null;
    await db.settings.put({ key: 'lastSwipe', value: { recipeId, prevSwipe, prevBook } });
    await db.swipes.put({ recipeId, action, at: Date.now() });
    if (action === 'love') {
      const row: CookbookRow = prevBook ?? emptyCookbookRow(recipeId);
      await db.cookbook.put({ ...row, saved: true, archived: false, wantToTry: false });
    } else if (action === 'save') {
      const row: CookbookRow = prevBook ?? emptyCookbookRow(recipeId);
      await db.cookbook.put({ ...row, saved: true, wantToTry: true, archived: false });
    }
  });
}

export async function undoLastSwipe(): Promise<string | null> {
  return db.transaction('rw', db.swipes, db.cookbook, db.settings, async () => {
    const row = await db.settings.get('lastSwipe');
    const last = row?.value as { recipeId: string; prevSwipe: null | { recipeId: string; action: SwipeAction; at: number }; prevBook: CookbookRow | null } | null | undefined;
    if (!last) return null;
    if (last.prevSwipe) await db.swipes.put(last.prevSwipe);
    else await db.swipes.delete(last.recipeId);
    if (last.prevBook) await db.cookbook.put(last.prevBook);
    else await db.cookbook.delete(last.recipeId);
    await db.settings.delete('lastSwipe');
    return last.recipeId;
  });
}

// Export, validate and restore all personal data. Restore never runs without validation.
import { z } from 'zod';
import { db, DB_SCHEMA_VERSION, type LoveBitesDB } from './db';

const TABLES = ['swipes', 'cookbook', 'collections', 'ratings', 'meals', 'sessions', 'shopExtras', 'shopLines', 'manualItems', 'pantry', 'pantryLog', 'productChoices', 'userRecipes', 'cooking', 'settings'] as const;
type TableName = (typeof TABLES)[number];

const row = z.record(z.string(), z.unknown());
const KEYS: Record<TableName, string> = {
  swipes: 'recipeId', cookbook: 'recipeId', collections: 'id', ratings: 'id', meals: 'id', sessions: 'id', shopExtras: 'id', shopLines: 'id', manualItems: 'id',
  pantry: 'id', pantryLog: 'id', productChoices: 'canonicalId', userRecipes: 'id', cooking: 'recipeId', settings: 'key',
};

export const BackupSchema = z.object({
  app: z.literal('love-bites'),
  schemaVersion: z.number().int().min(1).max(DB_SCHEMA_VERSION),
  exportedAt: z.string(),
  data: z.object(Object.fromEntries(TABLES.map((t) => [t, z.array(row).optional()]))),
});
export type Backup = z.infer<typeof BackupSchema>;

export async function exportBackup(database: LoveBitesDB = db): Promise<Backup> {
  const data: Record<string, unknown[]> = {};
  for (const t of TABLES) data[t] = await database.table(t).toArray();
  return { app: 'love-bites', schemaVersion: DB_SCHEMA_VERSION, exportedAt: new Date().toISOString(), data: data as Backup['data'] };
}

export interface BackupSummary { ok: true; backup: Backup; counts: Record<string, number>; }
export interface BackupFailure { ok: false; error: string; }

export function validateBackup(text: string): BackupSummary | BackupFailure {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file isn't valid JSON." };
  }
  const res = BackupSchema.safeParse(parsed);
  if (!res.success) return { ok: false, error: "That doesn't look like a Love Bites backup, or it's from a newer version." };
  for (const t of TABLES) {
    for (const r of (res.data.data[t] ?? []) as Record<string, unknown>[]) {
      if (typeof r[KEYS[t]] !== 'string') return { ok: false, error: `Backup has a damaged row in ${t}.` };
    }
  }
  const counts = Object.fromEntries(TABLES.map((t) => [t, (res.data.data[t] as unknown[] | undefined)?.length ?? 0]));
  return { ok: true, backup: res.data, counts };
}

/** merge: rows in the backup are added, rows already on this device win. replace: device data is swapped out. */
export async function restoreBackup(backup: Backup, mode: 'merge' | 'replace', database: LoveBitesDB = db) {
  await database.transaction('rw', database.tables, async () => {
    for (const t of TABLES) {
      const table = database.table(t);
      const rows = (backup.data[t] ?? []) as Record<string, unknown>[];
      if (mode === 'replace') {
        await table.clear();
        await table.bulkPut(rows);
      } else {
        const existing = new Set((await table.toCollection().primaryKeys()) as string[]);
        await table.bulkPut(rows.filter((r) => !existing.has(r[KEYS[t]] as string)));
      }
    }
  });
}

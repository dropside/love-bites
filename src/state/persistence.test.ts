import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { exportBackup, restoreBackup, validateBackup } from './backup';
import { emptyCookbookRow, LoveBitesDB, weekStartOf } from './db';

const fresh = () => new LoveBitesDB(`t-${Math.random()}`);

describe('migrations', () => {
  it('upgrades v1 data without losing it', async () => {
    const name = `mig-${Math.random()}`;
    const old = new Dexie(name);
    old.version(1).stores({ swipes: 'recipeId, action, at', cookbook: 'recipeId, addedAt, lastCookedAt', settings: 'key', pantry: 'id, canonicalId' });
    await old.open();
    await old.table('swipes').put({ recipeId: 'r1', action: 'love', at: 1 });
    await old.table('cookbook').put({ recipeId: 'r1', addedAt: 1, saved: true });
    old.close();

    const db = new LoveBitesDB(name);
    await db.open();
    expect(await db.swipes.get('r1')).toMatchObject({ action: 'love' });
    const row = await db.cookbook.get('r1');
    expect(row).toMatchObject({ saved: true, familyFavourite: false, collectionIds: [] });
    expect(await db.productChoices.count()).toBe(0);
    db.close();
  });
});

describe('backup and restore', () => {
  it('round trips, merges without overwriting, and replaces on request', async () => {
    const a = fresh();
    await a.swipes.put({ recipeId: 'x', action: 'love', at: 5 });
    await a.cookbook.put({ ...emptyCookbookRow('x'), saved: true });
    const backup = await exportBackup(a);

    const b = fresh();
    await b.swipes.put({ recipeId: 'x', action: 'pass', at: 9 });
    await b.swipes.put({ recipeId: 'y', action: 'pass', at: 9 });
    const parsed = validateBackup(JSON.stringify(backup));
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.counts.swipes).toBe(1);

    await restoreBackup(parsed.backup, 'merge', b);
    expect((await b.swipes.get('x'))?.action).toBe('pass');
    expect(await b.cookbook.count()).toBe(1);

    await restoreBackup(parsed.backup, 'replace', b);
    expect((await b.swipes.get('x'))?.action).toBe('love');
    expect(await b.swipes.get('y')).toBeUndefined();
  });

  it('rejects junk and damaged backups', () => {
    expect(validateBackup('nope').ok).toBe(false);
    expect(validateBackup('{"app":"other"}').ok).toBe(false);
    const bad = { app: 'love-bites', schemaVersion: 2, exportedAt: 'x', data: { swipes: [{ action: 'love' }] } };
    expect(validateBackup(JSON.stringify(bad)).ok).toBe(false);
    expect(validateBackup(JSON.stringify({ ...bad, schemaVersion: 99, data: {} })).ok).toBe(false);
  });
});

describe('dates', () => {
  it('finds Monday', () => {
    expect(weekStartOf(new Date(2026, 10, 2))).toBe('2026-11-02');
    expect(weekStartOf(new Date(2026, 10, 8))).toBe('2026-11-02');
    expect(weekStartOf(new Date(2026, 10, 9))).toBe('2026-11-09');
  });
});

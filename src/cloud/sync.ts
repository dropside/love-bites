// Keeps each person's data in the cloud and brings it to any phone they sign in on.
// Rows from the cloud are merged in; anything already on this device wins, so nothing local is lost.
import { exportBackup, restoreBackup, validateBackup } from '../state/backup';
import { db } from '../state/db';
import { cloud, liveUserId } from './client';

let lastPushed = '';
let lastLoves = '';

const fingerprint = (data: unknown) => {
  const s = JSON.stringify(data);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return `${s.length}:${h}`;
};

/** Bring in anything saved from another device (or before this phone signed in). */
export async function pullFromCloud(): Promise<boolean> {
  const c = cloud();
  const uid = await liveUserId();
  if (!c || !uid) return false;
  const { data, error } = await c.from('user_state').select('data').eq('user_id', uid).maybeSingle();
  if (error || !data?.data) return false;
  const res = validateBackup(JSON.stringify(data.data));
  if (!res.ok) return false;
  await restoreBackup(res.backup, 'merge');
  return true;
}

/** Save this device's data and publish loves to the family, only when something changed. */
export async function pushToCloud(): Promise<'saved' | 'unchanged' | 'offline'> {
  const c = cloud();
  const uid = await liveUserId();
  if (!c || !uid || !navigator.onLine) return 'offline';
  const backup = await exportBackup();
  const print = fingerprint(backup.data);
  let result: 'saved' | 'unchanged' = 'unchanged';
  if (print !== lastPushed) {
    const { error } = await c.from('user_state').upsert({ user_id: uid, data: backup, updated_at: new Date().toISOString() });
    if (error) return 'offline';
    lastPushed = print;
    setLastSynced(Date.now());
    result = 'saved';
  }
  await syncLoves(uid);
  return result;
}

async function syncLoves(uid: string) {
  const c = cloud()!;
  const loved = (await db.cookbook.toArray()).filter((r) => (r.saved || r.favourite) && !r.archived).map((r) => r.recipeId).sort();
  const print = loved.join('|');
  if (print === lastLoves) return;
  const { data, error } = await c.from('family_loves').select('recipe_id').eq('user_id', uid);
  if (error) return;
  const remote = new Set((data ?? []).map((r: { recipe_id: string }) => r.recipe_id));
  const mine = new Set(loved);
  const add = loved.filter((id) => !remote.has(id)).map((recipe_id) => ({ user_id: uid, recipe_id }));
  const remove = [...remote].filter((id) => !mine.has(id));
  if (add.length) await c.from('family_loves').upsert(add, { ignoreDuplicates: true });
  if (remove.length) await c.from('family_loves').delete().eq('user_id', uid).in('recipe_id', remove);
  lastLoves = print;
}

const SYNCED = 'lb-last-synced';
export const lastSynced = (): number | null => {
  try {
    return Number(localStorage.getItem(SYNCED)) || null;
  } catch {
    return null;
  }
};
function setLastSynced(t: number) {
  try {
    localStorage.setItem(SYNCED, String(t));
  } catch { /* cosmetic only */ }
}

/** Pull once, then push every half minute and whenever the app is hidden. Returns a stop function. */
export function startSync(): () => void {
  let stopped = false;
  const push = () => void pushToCloud().catch(() => undefined);
  void pullFromCloud().catch(() => false).then(() => !stopped && push());
  const timer = setInterval(push, 30_000);
  const onHide = () => document.visibilityState === 'hidden' && push();
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('online', push);
  return () => {
    stopped = true;
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('online', push);
  };
}

// Supabase connection for sign-in, sync and family sharing.
// The URL and publishable key are public by design: what each person can read or change is enforced
// by row-level security in supabase/schema.sql, never by keeping these values hidden.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const CLOUD = {
  url: '',
  key: '',
};

declare global {
  interface Window {
    /** Tests point the app at a mock backend, or switch the cloud off with null. */
    __LB_SUPABASE__?: { url: string; key: string } | null;
  }
}

function settings(): { url: string; key: string } | null {
  if (typeof window !== 'undefined' && '__LB_SUPABASE__' in window) return window.__LB_SUPABASE__ ?? null;
  if (import.meta.env.VITE_CLOUD === 'off') return null;
  return CLOUD.url && CLOUD.key ? CLOUD : null;
}

let client: SupabaseClient | null | undefined;

export function cloud(): SupabaseClient | null {
  if (client === undefined) {
    const s = settings();
    client = s ? createClient(s.url, s.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'lb-auth' } }) : null;
  }
  return client;
}

export const cloudEnabled = () => cloud() !== null;

// Signed-in status for the gate lives on the device, so the app still opens offline in the shop
// even when the sign-in token can't be refreshed. The data itself is protected server-side.
const MEMBER = 'lb-member';

export interface Member { id: string; email: string; }

export function currentMember(): Member | null {
  try {
    const raw = localStorage.getItem(MEMBER);
    return raw ? (JSON.parse(raw) as Member) : null;
  } catch {
    return null;
  }
}

export function rememberMember(m: Member) {
  try {
    localStorage.setItem(MEMBER, JSON.stringify(m));
  } catch { /* stays signed in until reload */ }
}

export async function signOut() {
  try {
    localStorage.removeItem(MEMBER);
  } catch { /* nothing stored */ }
  await cloud()?.auth.signOut({ scope: 'local' }).catch(() => undefined);
}

/** The signed-in user id, only when the session is usable right now (online, token valid). */
export async function liveUserId(): Promise<string | null> {
  const c = cloud();
  if (!c || !currentMember()) return null;
  const { data } = await c.auth.getSession().catch(() => ({ data: { session: null } }));
  return data.session?.user.id ?? null;
}

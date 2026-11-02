// A convenience gate, NOT security: GitHub Pages is public and this check runs in the browser.
// The bundle holds only a salted hash supplied at build time (VITE_KITCHEN_CODE_HASH).
const SALT = 'love-bites-kitchen-v1:';
const KEY = 'lb-unlocked';

export const configuredHash = (): string => (import.meta.env.VITE_KITCHEN_CODE_HASH as string | undefined)?.trim() ?? '';

export async function hashCode(code: string): Promise<string> {
  const bytes = new TextEncoder().encode(SALT + code.trim().toLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyCode(code: string, expected = configuredHash()): Promise<boolean> {
  if (!expected) return true;
  return (await hashCode(code)) === expected;
}

export function isUnlocked(): boolean {
  try {
    const hash = configuredHash();
    if (!hash) return localStorage.getItem(KEY) === 'open';
    return localStorage.getItem(KEY) === hash;
  } catch {
    return false;
  }
}

export function rememberUnlock() {
  try {
    localStorage.setItem(KEY, configuredHash() || 'open');
  } catch {
    /* storage blocked: stays unlocked until the page reloads */
  }
}

export function lockApp() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}

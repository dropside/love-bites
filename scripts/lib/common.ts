import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const path = (...p: string[]) => resolve(ROOT, ...p);
export const USER_AGENT = 'LoveBitesCatalogBot/1.0 (personal family recipe app; https://github.com/dropside/love-bites)';

export function writeJson(file: string, data: unknown, pretty = false) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, pretty ? 2 : undefined));
}
export function writeText(file: string, data: string) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, data);
}
export const readJson = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf8')) as T;
export const exists = existsSync;
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function slug(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70);
}

export function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Minimal robots.txt check for the `*` group and our agent. */
export async function robotsAllows(url: string): Promise<{ allowed: boolean; crawlDelayMs: number }> {
  const u = new URL(url);
  try {
    const res = await fetch(`${u.origin}/robots.txt`, { headers: { 'User-Agent': USER_AGENT } });
    if (res.status === 401 || res.status === 403) return { allowed: false, crawlDelayMs: 0 };
    if (!res.ok) return { allowed: true, crawlDelayMs: 2000 };
    let applies = false;
    const disallow: string[] = [];
    const allow: string[] = [];
    let delay = 2000;
    for (const raw of (await res.text()).split('\n')) {
      const line = raw.split('#')[0].trim();
      const [k, ...rest] = line.split(':');
      const v = rest.join(':').trim();
      const key = k.toLowerCase();
      if (key === 'user-agent') applies = v === '*' || v.toLowerCase().startsWith('lovebites');
      else if (applies && key === 'disallow' && v) disallow.push(v);
      else if (applies && key === 'allow' && v) allow.push(v);
      else if (applies && key === 'crawl-delay') delay = Math.max(delay, parseFloat(v) * 1000 || 0);
    }
    const p = u.pathname;
    const blocked = disallow.some((d) => p.startsWith(d)) && !allow.some((a) => p.startsWith(a));
    return { allowed: !blocked, crawlDelayMs: delay };
  } catch {
    return { allowed: false, crawlDelayMs: 0 };
  }
}

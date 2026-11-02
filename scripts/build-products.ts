// Validates the Woolworths feed into data/catalog/products.json.
// Default input: neon-ninja/woolies snapshot. Manual: npm run data:products -- --csv my.csv --observed 2026-11-01 --source "Manual"
// Manual columns: sku,name,brand,category,pack_qty,pack_unit,price_nzd,was_nzd,member_nzd,per_kg,unit_price,unit_measure,url_slug
import { parse } from 'csv-parse/sync';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import type { Dim, Product, ProductCatalogMeta } from '../src/domain/types';
import { parsePackSize } from '../src/domain/units';
import { arg, exists, path, readJson, slug, writeJson } from './lib/common';

const EXCLUDED = new Set(['Health & Body', 'Household', 'Baby & Child', 'Pet']);
const cents = (s: string | undefined) => {
  const n = parseFloat(s ?? '');
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
};

const ProductSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  brand: z.string().nullable(),
  dept: z.string().min(1),
  packQty: z.number().positive().nullable(),
  packDim: z.enum(['g', 'ml', 'each']).nullable(),
  variable: z.boolean(),
  avgGrams: z.number().positive().nullable(),
  priceCents: z.number().int().positive().nullable(),
  wasCents: z.number().int().positive().nullable(),
  clubCents: z.number().int().positive().nullable(),
  special: z.boolean(),
  unitPriceCents: z.number().int().positive().nullable(),
  unitPriceMeasure: z.string().nullable(),
  slug: z.string(),
});

const rejects: Record<string, number> = {};
const reject = (why: string) => {
  rejects[why] = (rejects[why] ?? 0) + 1;
};

function derivedSize(r: Record<string, string>) {
  if (r.unit !== 'Each') return null;
  const measure = parsePackSize(r['size.cupMeasure']);
  if (!measure) return null;
  if (measure.dim === 'each' && measure.qty === 1) return measure;
  const cup = parseFloat(r['size.cupPrice']);
  const price = parseFloat(r['price.salePrice']);
  return cup > 0 && price > 0 ? { qty: Math.round((price / cup) * measure.qty), dim: measure.dim } : null;
}

function fromWoolies(rows: Record<string, string>[]): Product[] {
  const out: Product[] = [];
  for (const r of rows) {
    const dept = /'name':\s*'([^']+)'/.exec(r.departments ?? '')?.[1] ?? '';
    if (EXCLUDED.has(dept)) {
      reject('non-food department');
      continue;
    }
    const variable = r.unit === 'Kg';
    // No printed size: a price per 1ea is one item; other shelf prices let us derive the pack size.
    const size = parsePackSize(r['size.volumeSize']) ?? derivedSize(r);
    const original = cents(r['price.originalPrice']);
    const sale = cents(r['price.salePrice']);
    const isClub = r['price.isClubPrice'] === 'True';
    const avgKg = parseFloat(r.averageWeightPerUnit);
    const priceCents = isClub ? original : sale ?? original;
    out.push({
      id: r.sku,
      name: r.name,
      brand: r.brand || null,
      dept,
      packQty: variable ? null : size?.qty ?? null,
      packDim: variable ? null : ((size?.dim ?? null) as Dim | null),
      variable,
      avgGrams: Number.isFinite(avgKg) && avgKg > 0 ? Math.round(avgKg * 1000) : null,
      priceCents,
      wasCents: !isClub && sale != null && original != null && original > sale ? original : null,
      clubCents: isClub ? sale : null,
      special: r['price.isSpecial'] === 'True' || isClub,
      unitPriceCents: cents(r['size.cupPrice']),
      unitPriceMeasure: r['size.cupMeasure'] || null,
      slug: r.slug,
    });
  }
  return out;
}

function fromManual(rows: Record<string, string>[]): Product[] {
  return rows.map((r) => {
    const size = parsePackSize(`${r.pack_qty}${r.pack_unit}`);
    const variable = /^(1|true|yes)$/i.test(r.per_kg ?? '');
    const price = cents(r.price_nzd);
    return {
      id: r.sku,
      name: (r.name ?? '').toLowerCase(),
      brand: r.brand || null,
      dept: r.category || 'Pantry',
      packQty: variable ? null : size?.qty ?? null,
      packDim: variable ? null : size?.dim ?? null,
      variable,
      avgGrams: null,
      priceCents: price,
      wasCents: cents(r.was_nzd),
      clubCents: cents(r.member_nzd),
      special: Boolean(cents(r.was_nzd) || cents(r.member_nzd)),
      unitPriceCents: cents(r.unit_price),
      unitPriceMeasure: r.unit_measure || null,
      slug: r.url_slug || slug(r.name ?? ''),
    };
  });
}

const manual = arg('csv');
const input = manual ?? path('data/raw/woolworths-products.csv');
if (!exists(input)) throw new Error(`No product file at ${input}. Run: npm run data:fetch -- --only woolworths`);
const rows = parse(readFileSync(input), { columns: true, skip_empty_lines: true, relax_column_count: true, relax_quotes: true }) as Record<string, string>[];
const raw = manual ? fromManual(rows) : fromWoolies(rows);

const seen = new Set<string>();
const products: Product[] = [];
for (const p of raw) {
  const res = ProductSchema.safeParse(p);
  if (!res.success) {
    reject(`invalid: ${res.error.issues[0].path.join('.')}`);
    continue;
  }
  if (seen.has(p.id)) {
    reject('duplicate sku');
    continue;
  }
  seen.add(p.id);
  products.push(p);
}

const feedMeta = manual ? null : readJson<{ observedAt: string }>(path('data/raw/woolworths-meta.json'));
const observedAt = arg('observed') ?? feedMeta?.observedAt;
if (!observedAt) throw new Error('Price observation date is required. Pass --observed YYYY-MM-DD.');
const meta: ProductCatalogMeta = {
  schemaVersion: 1,
  source: arg('source') ?? (manual ? 'Manual CSV import' : 'neon-ninja/woolies public snapshot of Woolworths NZ online prices'),
  sourceUrl: manual ? '' : 'https://github.com/neon-ninja/woolies',
  sourceLicense: manual ? 'Provided by user' : 'Repository MIT; prices are factual observations by a third party',
  observedAt: new Date(observedAt).toISOString(),
  importedAt: new Date().toISOString(),
  storeContext: arg('store') ?? 'Generic online pricing: the snapshot does not identify a specific store',
  productCount: products.length,
};
writeJson(path('data/catalog/products.json'), { meta, products, rejects });
console.log(`Products: ${products.length} valid of ${rows.length}.`, rejects);

// Compact array encoding: the product file is 14k rows and has to stay cheap on a phone.
import type { Dim, Product } from '../domain/types';

export type PackedProduct = [string, string, string | null, string, number | null, Dim | null, 0 | 1, number | null, number | null, number | null, number | null, 0 | 1, number | null, string | null, string];

export function packProducts(products: Product[]): PackedProduct[] {
  return products.map((p) => [p.id, p.name, p.brand, p.dept, p.packQty, p.packDim, p.variable ? 1 : 0, p.avgGrams, p.priceCents, p.wasCents, p.clubCents, p.special ? 1 : 0, p.unitPriceCents, p.unitPriceMeasure, p.slug]);
}

export function unpackProducts(rows: PackedProduct[]): Product[] {
  return rows.map(([id, name, brand, dept, packQty, packDim, variable, avgGrams, priceCents, wasCents, clubCents, special, unitPriceCents, unitPriceMeasure, slug]) => ({
    id, name, brand, dept, packQty, packDim, variable: variable === 1, avgGrams, priceCents, wasCents, clubCents, special: special === 1, unitPriceCents, unitPriceMeasure, slug,
  }));
}

export const productUrl = (p: Pick<Product, 'id' | 'slug'>) =>
  `https://www.woolworths.co.nz/shop/productdetails?stockcode=${encodeURIComponent(p.id)}&name=${encodeURIComponent(p.slug)}`;

import { useMemo, useState } from 'react';
import { Button, inputClass, selectClass, Sheet, Tag, useFeedback } from '../../components/ui';
import { productImage, productUrl } from '../../data/productCodec';
import { alternativesFor, type BasketContext } from '../../domain/basket';
import { formatMoney } from '../../domain/pricing';
import type { Product } from '../../domain/types';
import { formatQuantity } from '../../domain/units';
import { db } from '../../state/db';

export function productSize(p: Product) {
  if (p.variable) return 'per kg';
  if (p.packQty == null) return 'size unknown';
  return p.packDim === 'each' ? (p.packQty > 1 ? `${p.packQty} pack` : 'each') : formatQuantity(p.packQty, p.packDim);
}

function Thumb({ id }: { id: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <div aria-hidden className="h-14 w-14 shrink-0 rounded-xl bg-pale" />;
  return <img src={productImage(id)} alt="" width={56} height={56} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="h-14 w-14 shrink-0 rounded-xl bg-white object-contain" onError={() => setFailed(true)} data-testid="product-thumb" />;
}

type Sort = 'best' | 'cheapest' | 'value' | 'new' | 'specials' | 'az';
const SORTS: [Sort, string][] = [['best', 'Best match'], ['cheapest', 'Cheapest'], ['value', 'Best value (per kg / L)'], ['new', 'Newest'], ['specials', 'On special'], ['az', 'A to Z']];
const perUnit = (p: Product) => (p.priceCents == null ? Infinity : p.variable ? p.priceCents / 1000 : p.packQty ? p.priceCents / p.packQty : Infinity);

function sortProducts(list: Product[], sort: Sort): Product[] {
  if (sort === 'best') return list;
  const price = (p: Product) => p.priceCents ?? Infinity;
  const by: Record<Exclude<Sort, 'best'>, (a: Product, b: Product) => number> = {
    cheapest: (a, b) => price(a) - price(b),
    value: (a, b) => perUnit(a) - perUnit(b),
    new: (a, b) => Number(Boolean(b.isNew)) - Number(Boolean(a.isNew)),
    specials: (a, b) => Number(b.special) - Number(a.special) || price(a) - price(b),
    az: (a, b) => a.name.localeCompare(b.name),
  };
  return [...list].sort(by[sort]);
}

function ProductOption({ p, active, onPick }: { p: Product; active?: boolean; onPick: () => void }) {
  return (
    <li className="flex items-center gap-3 border-b border-line py-3 last:border-0" data-testid="product-option">
      <Thumb id={p.id} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold capitalize leading-tight">{p.name}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <span>{productSize(p)}</span>
          <span className="font-bold text-ink">{formatMoney(p.priceCents)}</span>
          {p.special && <Tag tone="lime" className="py-0">Special</Tag>}
          {p.isNew && <Tag tone="ink" className="py-0">New</Tag>}
          {p.clubCents != null && <Tag tone="gum" className="py-0">{formatMoney(p.clubCents)} member</Tag>}
          <a className="underline" href={productUrl(p)} target="_blank" rel="noreferrer">View</a>
        </div>
      </div>
      <Button size="sm" variant={active ? 'lime' : 'ink'} onClick={onPick} aria-label={`Use ${p.name}`}>{active ? 'Using' : 'Use'}</Button>
    </li>
  );
}

/** Pick a product for an ingredient. The choice is remembered for future shops. */
export function ProductPicker({ open, onClose, lineKey, canonicalId, name, ctx, list, currentId }: { open: boolean; onClose: () => void; lineKey: string; canonicalId: string | null; name: string; ctx: BasketContext | null; list: Product[]; currentId?: string | null }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('best');
  const { toast } = useFeedback();
  const suggested = useMemo(() => (ctx ? alternativesFor(canonicalId, ctx) : []), [ctx, canonicalId]);
  const results = useMemo(() => {
    const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    return list.filter((p) => p.priceCents != null && terms.every((t) => p.name.includes(t))).slice(0, 60);
  }, [q, list]);
  const shown = useMemo(() => sortProducts(results.length ? results : suggested, sort), [results, suggested, sort]);
  const pick = async (p: Product) => {
    await db.productChoices.put({ canonicalId: lineKey, productId: p.id, at: Date.now() });
    toast(`Using ${p.name}. I'll remember that.`);
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title={`Product for ${name.toLowerCase()}`}>
      <div className="flex gap-2">
        <input type="search" aria-label="Search all products" placeholder="Search all products" value={q} onChange={(e) => setQ(e.target.value)} className={inputClass} />
        <select aria-label="Sort products" data-testid="product-sort" className={`${selectClass} w-40 shrink-0`} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          {SORTS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
      </div>
      <p className="mt-2 text-xs text-muted">Check a swap still suits the recipe, especially with allergies. Nothing is substituted without you choosing it.</p>
      <ul className="mt-2">
        {shown.map((p) => <ProductOption key={p.id} p={p} active={p.id === currentId} onPick={() => void pick(p)} />)}
      </ul>
      {!results.length && !suggested.length && <p className="py-4 text-center text-sm text-muted">No suggestions. Try searching.</p>}
      <Button variant="ghost" size="sm" className="mt-3 w-full" onClick={() => { void db.productChoices.delete(lineKey); toast('Back to the automatic pick.'); onClose(); }}>Use automatic pick</Button>
    </Sheet>
  );
}

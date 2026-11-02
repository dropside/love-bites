import { useMemo, useState } from 'react';
import { Button, inputClass, Sheet, Tag, useFeedback } from '../../components/ui';
import { productUrl } from '../../data/productCodec';
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

function ProductOption({ p, active, onPick }: { p: Product; active?: boolean; onPick: () => void }) {
  return (
    <li className="flex items-center gap-3 border-b border-line py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold capitalize leading-tight">{p.name}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <span>{productSize(p)}</span>
          <span className="font-bold text-ink">{formatMoney(p.priceCents)}</span>
          {p.special && <Tag tone="lime" className="py-0">Special</Tag>}
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
  const { toast } = useFeedback();
  const suggested = useMemo(() => (ctx ? alternativesFor(canonicalId, ctx) : []), [ctx, canonicalId]);
  const results = useMemo(() => {
    const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    return list.filter((p) => p.priceCents != null && terms.every((t) => p.name.includes(t))).slice(0, 30);
  }, [q, list]);
  const pick = async (p: Product) => {
    await db.productChoices.put({ canonicalId: lineKey, productId: p.id, at: Date.now() });
    toast(`Using ${p.name}. I'll remember that.`);
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title={`Product for ${name.toLowerCase()}`}>
      <input type="search" aria-label="Search all products" placeholder="Search all products" value={q} onChange={(e) => setQ(e.target.value)} className={inputClass} />
      <p className="mt-2 text-xs text-muted">Check a swap still suits the recipe, especially with allergies. Nothing is substituted without you choosing it.</p>
      <ul className="mt-2">
        {(results.length ? results : suggested).map((p) => <ProductOption key={p.id} p={p} active={p.id === currentId} onPick={() => void pick(p)} />)}
      </ul>
      {!results.length && !suggested.length && <p className="py-4 text-center text-sm text-muted">No suggestions. Try searching.</p>}
      <Button variant="ghost" size="sm" className="mt-3 w-full" onClick={() => { void db.productChoices.delete(lineKey); toast('Back to the automatic pick.'); onClose(); }}>Use automatic pick</Button>
    </Sheet>
  );
}

import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, ChevronRight, ExternalLink, Plus, Store, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, Checkbox, Empty, Field, IconButton, inputClass, selectClass, Sheet, Skeleton, Stepper, Tag, useFeedback } from '../../components/ui';
import { productUrl } from '../../data/productCodec';
import { formatMoney, priceStatus, PRICE_STATUS_LABEL } from '../../domain/pricing';
import type { ShopCategory } from '../../domain/types';
import { formatQuantity } from '../../domain/units';
import { getCanonical } from '../../domain/ingredients';
import { activeSession, addDays, db, setBuyStaple, weekStartOf } from '../../state/db';
import { useHousehold } from '../../state/hooks';
import { useManifest } from './useManifest';
import { ProductPicker } from './ProductPicker';
import { addManualItem, CATEGORY_LABEL, completeShop, needLabel, packLabel, patchLine, setChecked, useShopping, type ShopRow } from './shopState';

function Row({ row, sessionId, onOpen }: { row: ShopRow; sessionId: string; onOpen: () => void }) {
  const l = row.line;
  return (
    <li data-testid="shop-row" className={`flex items-center gap-3 py-3 ${row.checked || row.unavailable ? 'opacity-50' : ''}`}>
      <Checkbox checked={row.checked} label={`Got ${l.name}`} onChange={(c) => void setChecked(sessionId, row.key, c)} />
      <button type="button" className="min-w-0 flex-1 text-left" onClick={onOpen}>
        <p className={`font-bold leading-tight ${row.checked ? 'line-through' : ''}`}>{l.name}</p>
        {row.product ? (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted">{packLabel(row.product, row.count, row.weightGrams)} · <span className="capitalize">{row.product.name}{row.extraProducts.map((e) => ` + ${e.count} × ${e.product.name}`).join('')}</span></p>
        ) : (
          <p className="mt-0.5 text-xs text-muted">Need {needLabel(l)}. No product picked.</p>
        )}
        <p className="text-xs text-muted" data-testid="row-need">Need {needLabel(l)}{l.pantryUsed > 0 && l.dim ? ` · ${formatQuantity(l.pantryUsed, l.dim)} from pantry` : ''}{l.usedBy.length > 1 ? ` · ${l.usedBy.length} meals` : ''}</p>
        {l.needsReview && <span className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-[#7A3B00]"><AlertTriangle size={12} aria-hidden /> {l.reviewReason}</span>}
      </button>
      <div className="text-right">
        <p className="font-bold tabular-nums">{row.unavailable ? 'None' : row.costCents != null ? formatMoney(row.costCents) : '?'}</p>
        <ChevronRight size={16} aria-hidden className="ml-auto text-muted" />
      </div>
    </li>
  );
}

function ItemSheet({ row, sessionId, onClose, onChangeProduct }: { row: ShopRow | null; sessionId: string; onClose: () => void; onChangeProduct: () => void }) {
  const [actual, setActual] = useState('');
  if (!row) return null;
  const l = row.line;
  return (
    <Sheet open onClose={onClose} title={l.name}>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        {([
          ['Recipes need', needLabel(l)],
          ['From pantry', l.dim ? formatQuantity(l.pantryUsed, l.dim) : '—'],
          ['Still to buy', l.dim ? formatQuantity(l.toBuy, l.dim) : needLabel(l)],
          ['Leftover', l.dim && l.leftover > 0 ? formatQuantity(l.leftover, l.dim) : 'None expected'],
        ] as const).map(([k, v]) => (
          <div key={k} className="rounded-2xl bg-pale p-3"><dt className="text-xs font-bold text-muted">{k}</dt><dd className="font-bold">{v}</dd></div>
        ))}
      </dl>
      {l.usedBy.length > 0 && <p className="mt-3 text-sm text-muted">For: {[...new Set(l.usedBy.map((u) => u.title))].join(', ')}</p>}
      {row.product && (
        <div className="mt-4 rounded-2xl border border-line p-3">
          <p className="font-bold capitalize">{row.product.name}</p>
          <p className="text-sm text-muted">{packLabel(row.product, row.count, row.weightGrams)} · {formatMoney(row.product.priceCents)}{row.product.variable ? ' /kg' : ' each'}</p>
          {row.product.clubCents != null && <p className="text-sm font-bold text-deep">{formatMoney(row.product.clubCents)} with Everyday Rewards</p>}
          <a href={productUrl(row.product)} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-sm font-bold underline">Open on Woolworths <ExternalLink size={14} aria-hidden /></a>
        </div>
      )}
      <div className="mt-4 space-y-4">
        <Button variant="white" className="w-full" onClick={onChangeProduct}>Change product</Button>
        {row.product && !row.product.variable && (
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold">Packs to buy</span>
            <Stepper label="packs" value={row.count} min={0} onChange={(n) => void patchLine(sessionId, row.key, { countOverride: n })} />
          </div>
        )}
        <Field label="Actual price at the shelf" hint={row.actualCents != null ? `Recorded ${formatMoney(row.actualCents)}` : 'Updates your total if it differs.'}>
          <div className="flex gap-2">
            <input inputMode="decimal" aria-label="Actual price" placeholder={row.estCents != null ? (row.estCents / 100).toFixed(2) : '0.00'} value={actual} onChange={(e) => setActual(e.target.value)} className={inputClass} />
            <Button disabled={!(parseFloat(actual) >= 0)} onClick={() => { void patchLine(sessionId, row.key, { actualCents: Math.round(parseFloat(actual) * 100) }); setActual(''); }}>Save</Button>
          </div>
        </Field>
        <div className="flex gap-2">
          <Button variant={row.unavailable ? 'lime' : 'ghost'} className="flex-1" onClick={() => void patchLine(sessionId, row.key, { unavailable: !row.unavailable })}>{row.unavailable ? 'Available again' : 'Not on the shelf'}</Button>
          <Button variant="ghost" className="flex-1" icon={Trash2} onClick={() => { void patchLine(sessionId, row.key, { removed: true }); onClose(); }}>Remove</Button>
        </div>
      </div>
    </Sheet>
  );
}

export function ShopScreen() {
  const s = useShopping();
  const household = useHousehold();
  const navigate = useNavigate();
  const { toast } = useFeedback();
  const manifest = useManifest();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [pickerKey, setPickerKey] = useState<string | null>(null);
  const [adding, setAdding] = useState('');
  const [addCat, setAddCat] = useState<ShopCategory>('other');
  const history = useLiveQuery(() => db.sessions.where('status').equals('complete').count(), []);

  const openRow = s.rows?.find((r) => r.key === openKey) ?? null;
  const pickerRow = s.rows?.find((r) => r.key === pickerKey) ?? null;
  const week = s.week;
  const thisWeek = weekStartOf();
  const nextWeek = weekStartOf(addDays(thisWeek, 7));
  const status = priceStatus(manifest?.products?.observedAt);
  const totals = s.totals;

  const onAdd = (e: FormEvent) => {
    e.preventDefault();
    if (!adding.trim() || !s.session) return;
    void addManualItem(s.session.id, adding.trim(), addCat);
    setAdding('');
  };

  const finish = async () => {
    if (!s.session || !s.rows || !totals) return;
    // Everything ticked goes straight into the pantry, so the next list knows what's at home.
    const added = await completeShop(s.session.id, s.rows, totals.total, true);
    await activeSession();
    toast(added ? `Shop complete. ${added} item${added === 1 ? '' : 's'} added to your pantry.` : 'Shop complete. Go you.');
    navigate('/pantry');
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h1 className="display text-[2rem]">Shop</h1>
        {s.session && (
          <select aria-label="Which week to shop for" className="h-10 rounded-full border border-line bg-white px-3 text-sm font-bold" value={week} onChange={(e) => void db.sessions.update(s.session!.id, { weekStart: e.target.value })}>
            <option value={thisWeek}>This week</option>
            <option value={nextWeek}>Next week</option>
          </select>
        )}
      </div>

      {s.loading && <><Skeleton className="mb-3 h-36" /><Skeleton className="h-64" /></>}

      {totals && s.session && (
        <>
          <Card className="mb-4 bg-ink text-white">
            <p className="text-sm font-bold text-gum">Estimated basket</p>
            <p className="display text-5xl tabular-nums" data-testid="basket-total">{formatMoney(totals.total)}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              <span>{totals.items} items</span>
              {s.basket && s.basket.totals.pantrySavingCents > 0 && <Tag tone="lime">Pantry saves ~{formatMoney(s.basket.totals.pantrySavingCents)}</Tag>}
              {totals.unpriced > 0 && <Tag tone="warn">{totals.unpriced} without a price</Tag>}
            </div>
            <p className="mt-2 text-xs text-white/75">{PRICE_STATUS_LABEL[status]}{manifest?.products ? ` (${new Date(manifest.products.observedAt).toLocaleDateString('en-NZ')})` : ''}. Generic online prices, so shelf prices may differ.{household.store ? ` Your store: ${household.store}.` : ''}</p>
            <Button variant="hot" size="lg" icon={Store} className="mt-3 w-full" disabled={!totals.items} onClick={() => navigate('/shop/mode')} data-testid="start-shop-mode">Shop mode</Button>
          </Card>

          <form onSubmit={onAdd} className="mb-4 flex gap-2">
            <input aria-label="Add an item" placeholder="Add anything else…" value={adding} onChange={(e) => setAdding(e.target.value)} className={`${inputClass} min-w-0 flex-1 rounded-full`} />
            <select aria-label="Item category" value={addCat} onChange={(e) => setAddCat(e.target.value as ShopCategory)} className={`${selectClass} w-28 rounded-full`}>
              {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v.split(' ')[0]}</option>)}
            </select>
            <IconButton type="submit" icon={Plus} label="Add item" variant="ink" size={48} disabled={!adding.trim()} />
          </form>

          {!totals.items && (
            <Empty title="Nothing to buy yet." action={<Link to="/plan"><Button>Plan the week</Button></Link>}>
              Add meals to your plan or send a recipe here, and the list builds itself.
            </Empty>
          )}

          <div className="space-y-4">
            {s.groups.map((g) => (
              <section key={g.category} aria-label={CATEGORY_LABEL[g.category] ?? g.category}>
                <h2 className="mb-1 ml-1 text-sm font-extrabold uppercase tracking-wide text-deep">{CATEGORY_LABEL[g.category] ?? g.category}</h2>
                <Card className="py-1">
                  <ul className="divide-y divide-line">
                    {g.rows.map((r) => <Row key={r.key} row={r} sessionId={s.session!.id} onOpen={() => setOpenKey(r.key)} />)}
                    {g.manual.map((m) => (
                      <li key={m.id} className={`flex items-center gap-3 py-3 ${m.checked ? 'opacity-50' : ''}`}>
                        <Checkbox checked={m.checked} label={`Got ${m.name}`} onChange={(c) => void db.manualItems.update(m.id, { checked: c, checkedAt: c ? Date.now() : null })} />
                        <p className={`flex-1 font-bold ${m.checked ? 'line-through' : ''}`}>{m.name}</p>
                        <IconButton icon={Trash2} label={`Remove ${m.name}`} variant="ghost" size={40} onClick={() => void db.manualItems.delete(m.id)} />
                      </li>
                    ))}
                  </ul>
                </Card>
              </section>
            ))}
          </div>

          {(s.stapleLines.length > 0 || s.buyStaples.size > 0) && (
            <section aria-label="Staples" className="mt-4" data-testid="staples-section">
              <h2 className="mb-1 ml-1 text-sm font-extrabold uppercase tracking-wide text-deep">Staples</h2>
              <Card className="py-1">
                <p className="pt-2 text-xs text-muted">Things like salt and oil are assumed to be at home. Tick any you're out of and they go on the list.</p>
                <ul className="divide-y divide-line">
                  {[...new Map([...s.stapleLines.map((l) => [l.canonicalId!, l.name] as const), ...[...s.buyStaples].map((id) => [id, getCanonical(id)?.name ?? id] as const)]).entries()]
                    .sort((a, b) => a[1].localeCompare(b[1]))
                    .map(([id, name]) => (
                      <li key={id} className="flex items-center gap-3 py-2.5">
                        <Checkbox checked={s.buyStaples.has(id)} label={`Buy ${name}`} onChange={(c) => void setBuyStaple(id, c)} />
                        <p className="flex-1 font-bold">{name}</p>
                        <span className="text-xs text-muted">{s.buyStaples.has(id) ? 'On the list' : 'At home'}</span>
                      </li>
                    ))}
                </ul>
              </Card>
            </section>
          )}

          {totals.items > 0 && (
            <Card className="mt-4">
              <h2 className="display mb-2 text-xl">How the numbers work</h2>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between"><dt>Ingredients actually used</dt><dd className="font-bold tabular-nums">~{formatMoney(s.basket?.totals.valueCents)}</dd></div>
                <div className="flex justify-between"><dt>Expected at checkout</dt><dd className="font-bold tabular-nums">{formatMoney(totals.total)}</dd></div>
                <div className="flex justify-between"><dt>Saved using pantry</dt><dd className="font-bold tabular-nums">~{formatMoney(s.basket?.totals.pantrySavingCents)}</dd></div>
                <div className="flex justify-between"><dt>Leftovers worth</dt><dd className="font-bold tabular-nums">~{formatMoney(s.basket?.totals.leftoverValueCents)}</dd></div>
              </dl>
              <Button variant="lime" className="mt-4 w-full" onClick={() => void finish()} data-testid="complete-shop">Finish this shop</Button>
              {Boolean(history) && <p className="mt-2 text-center text-xs text-muted">{history} past shops saved.</p>}
            </Card>
          )}
        </>
      )}
      {openRow && s.session && <ItemSheet key={openRow.key} row={openRow} sessionId={s.session.id} onClose={() => setOpenKey(null)} onChangeProduct={() => { setPickerKey(openRow.key); setOpenKey(null); }} />}
      {pickerRow && <ProductPicker open onClose={() => setPickerKey(null)} lineKey={pickerRow.key} canonicalId={pickerRow.line.canonicalId} name={pickerRow.line.name} ctx={s.ctx} list={s.data?.list ?? []} currentId={pickerRow.product?.id} />}
    </div>
  );
}

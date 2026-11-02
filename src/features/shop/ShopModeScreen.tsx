import { ArrowLeft, Check, ChevronDown, Plus, Sun } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button, Checkbox, IconButton, inputClass, Progress, Skeleton, useFeedback } from '../../components/ui';
import { formatMoney } from '../../domain/pricing';
import { db } from '../../state/db';
import { useWakeLock } from '../../state/hooks';
import { addManualItem, CATEGORY_LABEL, needLabel, packLabel, setChecked, useShopping } from './shopState';

/** Distraction-free, one-handed list for walking around Woolworths. All local, no network needed. */
export default function ShopModeScreen() {
  const s = useShopping();
  const awake = useWakeLock();
  const { toast } = useFeedback();
  const [showDone, setShowDone] = useState(false);
  const [adding, setAdding] = useState('');
  const totals = s.totals;

  const check = (key: string, name: string, on: boolean) => {
    if (!s.session) return;
    const id = s.session.id;
    void setChecked(id, key, on);
    if (on) toast(`Got ${name.toLowerCase()}.`, { label: 'Undo', run: () => void setChecked(id, key, false) });
  };
  const checkManual = (id: string, name: string, on: boolean) => {
    void db.manualItems.update(id, { checked: on, checkedAt: on ? Date.now() : null });
    if (on) toast(`Got ${name.toLowerCase()}.`, { label: 'Undo', run: () => void db.manualItems.update(id, { checked: false, checkedAt: null }) });
  };
  const add = (e: FormEvent) => {
    e.preventDefault();
    if (s.session && adding.trim()) void addManualItem(s.session.id, adding.trim());
    setAdding('');
  };

  const done = s.rows?.filter((r) => r.checked || r.unavailable) ?? [];
  const manualDone = s.manual.filter((m) => m.checked);

  return (
    <div className="min-h-dvh bg-bg pb-24">
      <header className="safe-t sticky top-0 z-30 bg-ink px-4 pb-3 text-white">
        <div className="flex h-12 items-center justify-between">
          <Link to="/shop" aria-label="Back to list" className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10"><ArrowLeft size={22} aria-hidden /></Link>
          <p className="display text-xl" data-testid="remaining-count">{totals ? `${totals.items - totals.done} to go` : ''}</p>
          <span aria-label={awake ? 'Screen staying awake' : undefined} className="flex h-11 w-11 items-center justify-center">{awake && <Sun size={20} className="text-lime" aria-hidden />}</span>
        </div>
        {totals && (
          <>
            <Progress label="Shop progress" value={totals.items ? totals.done / totals.items : 0} tone="lime" />
            <p className="mt-1.5 text-center text-sm font-bold tabular-nums">{formatMoney(totals.remaining)} left of ~{formatMoney(totals.total)}</p>
          </>
        )}
      </header>
      <main className="mx-auto max-w-xl px-3 pt-3">
        {s.loading && <Skeleton className="h-96" />}
        {s.groups.map((g) => {
          const rows = g.rows.filter((r) => !r.checked && !r.unavailable);
          const manual = g.manual.filter((m) => !m.checked);
          if (!rows.length && !manual.length) return null;
          return (
            <section key={g.category} className="mb-4" aria-label={CATEGORY_LABEL[g.category]}>
              <h2 className="mb-1 ml-2 text-sm font-extrabold uppercase tracking-wide text-deep">{CATEGORY_LABEL[g.category] ?? g.category}</h2>
              <ul className="space-y-2">
                {rows.map((r) => (
                  <li key={r.key} data-testid="mode-row" className="flex items-center gap-3 rounded-[1.5rem] bg-white p-3 shadow-[var(--shadow-card)]">
                    <div className="min-w-0 flex-1" onClick={() => check(r.key, r.line.name, true)}>
                      <p className="text-lg font-extrabold leading-tight">{r.line.name}</p>
                      {r.product ? (
                        <p className="text-base font-bold text-deep">{packLabel(r.product, r.count, r.weightGrams)}</p>
                      ) : (
                        <p className="text-sm text-muted">Need {needLabel(r.line)}</p>
                      )}
                      {r.product && <p className="line-clamp-1 text-sm capitalize text-muted">{r.product.name}</p>}
                      {r.costCents != null && <p className="text-sm font-bold tabular-nums">~{formatMoney(r.costCents)}</p>}
                    </div>
                    <Checkbox big checked={false} label={`Got ${r.line.name}`} onChange={() => check(r.key, r.line.name, true)} />
                  </li>
                ))}
                {manual.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 rounded-[1.5rem] bg-white p-3 shadow-[var(--shadow-card)]">
                    <p className="min-w-0 flex-1 text-lg font-extrabold">{m.name}</p>
                    <Checkbox big checked={false} label={`Got ${m.name}`} onChange={() => checkManual(m.id, m.name, true)} />
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        {totals && totals.items > 0 && totals.done === totals.items && (
          <div className="rounded-[2rem] bg-lime p-6 text-center">
            <p className="display text-3xl">Trolley: conquered.</p>
            <Link to="/shop"><Button className="mt-3" icon={Check}>Back to finish up</Button></Link>
          </div>
        )}
        {(done.length > 0 || manualDone.length > 0) && (
          <section className="mt-5">
            <button type="button" aria-expanded={showDone} onClick={() => setShowDone(!showDone)} className="flex h-12 w-full items-center justify-between rounded-full bg-pale px-5 font-bold">
              Got {done.length + manualDone.length} <ChevronDown size={18} aria-hidden className={showDone ? 'rotate-180' : ''} />
            </button>
            {showDone && (
              <ul className="mt-2 space-y-1">
                {done.map((r) => (
                  <li key={r.key} className="flex items-center gap-3 rounded-2xl bg-white/70 p-2">
                    <Checkbox checked label={`Uncheck ${r.line.name}`} onChange={() => check(r.key, r.line.name, false)} />
                    <p className="flex-1 font-semibold text-muted line-through">{r.line.name}{r.unavailable ? ' (not on shelf)' : ''}</p>
                  </li>
                ))}
                {manualDone.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 rounded-2xl bg-white/70 p-2">
                    <Checkbox checked label={`Uncheck ${m.name}`} onChange={() => checkManual(m.id, m.name, false)} />
                    <p className="flex-1 font-semibold text-muted line-through">{m.name}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>
      <form onSubmit={add} className="safe-b fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-line bg-white px-3 pt-2">
        <input aria-label="Quick add item" placeholder="Forgot something?" value={adding} onChange={(e) => setAdding(e.target.value)} className={`${inputClass} rounded-full`} />
        <IconButton type="submit" icon={Plus} label="Add" variant="ink" size={48} disabled={!adding.trim()} />
      </form>
    </div>
  );
}

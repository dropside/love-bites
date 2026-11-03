import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, Pin, Plus, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { RecipeRow } from '../../components/RecipeBits';
import { Button, Card, Chip, Empty, Field, IconButton, inputClass, SegmentedControl, selectClass, Sheet, Tag, useFeedback } from '../../components/ui';
import { CANONICAL_INGREDIENTS } from '../../domain/canonicalData';
import { getCanonical, resolveCanonical } from '../../domain/ingredients';
import type { Dim, RecipeSummary } from '../../domain/types';
import { formatQuantity } from '../../domain/units';
import { db, inCookbook, uid, type PantryLocation, type PantryRow } from '../../state/db';
import { useCatalogIndex, useHousehold } from '../../state/hooks';
import { undoLog } from './pantryActions';

const LOCATIONS: PantryLocation[] = ['pantry', 'fridge', 'freezer'];
const DAY = 86_400_000;

function EditSheet({ item, onClose }: { item: Partial<PantryRow> | null; onClose: () => void }) {
  const { confirm, toast } = useFeedback();
  const [name, setName] = useState(item?.name ?? '');
  const [canonicalId, setCanonicalId] = useState<string | null>(item?.canonicalId ?? null);
  const [quantity, setQuantity] = useState(item?.quantity != null ? String(item.quantity) : '');
  const [dim, setDim] = useState<Dim>(item?.dim ?? 'g');
  const [staple, setStaple] = useState(item?.staple ?? false);
  const [location, setLocation] = useState<PantryLocation>(item?.location ?? 'pantry');
  const [expiry, setExpiry] = useState(item?.expiry ?? '');
  const [lowAt, setLowAt] = useState(item?.lowAt != null ? String(item.lowAt) : '');
  const suggestions = useMemo(() => {
    const q = name.trim().toLowerCase();
    if (q.length < 2 || canonicalId) return [];
    return CANONICAL_INGREDIENTS.filter((c) => !c.free && (c.name.toLowerCase().includes(q) || c.aliases.some((a) => a.includes(q)))).slice(0, 6);
  }, [name, canonicalId]);

  const save = async () => {
    const qty = parseFloat(quantity);
    const canon = canonicalId ?? resolveCanonical(name).id;
    await db.pantry.put({
      id: item?.id ?? uid(), canonicalId: canon, name: getCanonical(canon)?.name ?? name.trim(), quantity: staple && !quantity ? null : Number.isFinite(qty) ? qty : null, dim: Number.isFinite(qty) ? dim : null,
      staple, expiry: expiry || null, location, lowAt: parseFloat(lowAt) || null, addedAt: item?.addedAt ?? Date.now(),
    });
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title={item?.id ? 'Edit item' : 'Add to pantry'} footer={<Button className="mb-1 w-full" data-testid="save-pantry" disabled={!name.trim()} onClick={() => void save()}>Save</Button>}>
      <div className="space-y-4">
        <Field label="Ingredient">
          <input className={inputClass} data-testid="pantry-name" value={name} onChange={(e) => { setName(e.target.value); setCanonicalId(null); }} placeholder="Chicken breast, rice, onions…" />
        </Field>
        {suggestions.length > 0 && <div className="flex flex-wrap gap-2">{suggestions.map((c) => <Chip key={c.id} data-testid="pantry-suggestion" onClick={() => { setName(c.name); setCanonicalId(c.id); }}>{c.name}</Chip>)}</div>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantity"><input inputMode="decimal" data-testid="pantry-qty" className={inputClass} value={quantity} onChange={(e) => setQuantity(e.target.value)} /></Field>
          <Field label="Unit"><select className={selectClass} data-testid="pantry-unit" value={dim} onChange={(e) => setDim(e.target.value as Dim)}><option value="g">grams</option><option value="ml">millilitres</option><option value="each">items</option></select></Field>
          <Field label="Kept in"><select className={selectClass} value={location} onChange={(e) => setLocation(e.target.value as PantryLocation)}>{LOCATIONS.map((l) => <option key={l} value={l} className="capitalize">{l}</option>)}</select></Field>
          <Field label="Best before"><input type="date" className={inputClass} value={expiry} onChange={(e) => setExpiry(e.target.value)} /></Field>
          <Field label="Running low at" hint="Optional"><input inputMode="decimal" className={inputClass} value={lowAt} onChange={(e) => setLowAt(e.target.value)} /></Field>
        </div>
        <label className="flex items-center gap-3 font-bold"><input type="checkbox" className="h-6 w-6 accent-[#19171B]" checked={staple} onChange={(e) => setStaple(e.target.checked)} /> Staple: always assume I have this</label>
        {item?.id && (
          <Button variant="ghost" className="w-full" onClick={() => { void confirm({ title: `Remove ${name}?`, danger: true, confirmLabel: 'Remove' }).then((ok) => { if (ok) { const row = item as PantryRow; void db.pantry.delete(row.id).then(() => toast(`Removed ${name}.`, { label: 'Undo', run: () => void db.pantry.put(row) })); onClose(); } }); }}>Remove from pantry</Button>
        )}
      </div>
    </Sheet>
  );
}

type Idea = 'now' | 'almost' | 'first' | 'waste';

export function PantryScreen() {
  const pantry = useLiveQuery(() => db.pantry.toArray(), []);
  const logs = useLiveQuery(() => db.pantryLog.orderBy('at').reverse().limit(5).toArray(), []);
  const cookbook = useLiveQuery(() => db.cookbook.filter(inCookbook).toArray(), []);
  const { index } = useCatalogIndex();
  const household = useHousehold();
  const [editing, setEditing] = useState<Partial<PantryRow> | null>(null);
  const [loc, setLoc] = useState<PantryLocation | 'all'>('all');
  const [idea, setIdea] = useState<Idea>('now');
  const [now, setNow] = useState(0);
  useEffect(() => setNow(Date.now()), [pantry]);

  const have = useMemo(() => {
    const s = new Set(household.stapleIds);
    for (const p of pantry ?? []) if (p.canonicalId && (p.staple || p.quantity == null || p.quantity > 0)) s.add(p.canonicalId);
    return s;
  }, [pantry, household.stapleIds]);

  const ideas = useMemo(() => {
    const byId = new Map(index?.map((r) => [r.id, r]));
    const saved = (cookbook ?? []).map((c) => byId.get(c.recipeId)).filter((r): r is RecipeSummary => Boolean(r) && r!.ingredientIds.length > 0);
    const missing = (r: RecipeSummary) => r.ingredientIds.filter((i) => !have.has(i) && !getCanonical(i)?.free);
    const expiring = new Set((pantry ?? []).filter((p) => p.canonicalId && p.expiry && Date.parse(p.expiry) - now < 5 * DAY && Date.parse(p.expiry) >= now - DAY).map((p) => p.canonicalId!));
    const stocked = new Set((pantry ?? []).filter((p) => p.canonicalId && !p.staple && (p.quantity ?? 0) > 0).map((p) => p.canonicalId!));
    const usesCount = (r: RecipeSummary, set: Set<string>) => r.ingredientIds.filter((i) => set.has(i)).length;
    return {
      now: saved.filter((r) => missing(r).length === 0),
      almost: saved.filter((r) => [1, 2].includes(missing(r).length)).sort((a, b) => missing(a).length - missing(b).length),
      first: saved.filter((r) => usesCount(r, expiring) > 0).sort((a, b) => usesCount(b, expiring) - usesCount(a, expiring)),
      waste: saved.filter((r) => usesCount(r, stocked) >= 2).sort((a, b) => usesCount(b, stocked) - usesCount(a, stocked)),
      missing,
    };
  }, [index, cookbook, have, pantry, now]);

  const items = (pantry ?? []).filter((p) => loc === 'all' || p.location === loc).sort((a, b) => a.name.localeCompare(b.name));
  const low = (pantry ?? []).filter((p) => p.lowAt != null && p.quantity != null && p.quantity <= p.lowAt);
  const lastLog = logs?.find((l) => !l.undone && l.delta < 0);
  const ideaList: RecipeSummary[] = ideas[idea];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="display text-[2rem]">Pantry</h1>
        <Button icon={Plus} data-testid="add-pantry" onClick={() => setEditing({})}>Add</Button>
      </div>

      <Card className="mb-4 bg-lime">
        <h2 className="display text-xl">What can I cook?</h2>
        <div className="my-2"><SegmentedControl label="Pantry ideas" value={idea} onChange={setIdea} options={[
          { value: 'now', label: 'Cook now', count: ideas.now.length },
          { value: 'almost', label: 'Almost ready', count: ideas.almost.length },
          { value: 'first', label: 'Use these first', count: ideas.first.length },
          { value: 'waste', label: 'Low waste', count: ideas.waste.length },
        ]} /></div>
        <div className="space-y-2">
          {ideaList.slice(0, 5).map((r) => {
            const miss = ideas.missing(r);
            return <RecipeRow key={r.id} r={r} sub={idea === 'almost' && miss.length ? <p className="mt-0.5 text-xs font-bold text-deep">Just need: {miss.map((m) => getCanonical(m)?.name.toLowerCase() ?? m).join(', ')}</p> : undefined} />;
          })}
          {!ideaList.length && <p className="rounded-2xl bg-white/70 p-3 text-sm font-semibold">Nothing here yet. It looks through your saved recipes, so swipe some and stock the pantry.</p>}
        </div>
      </Card>

      {low.length > 0 && <p className="mb-3 flex items-center gap-2 rounded-2xl bg-[#FFE3C2] p-3 text-sm font-bold text-[#7A3B00]"><AlertTriangle size={16} aria-hidden /> Running low: {low.map((l) => l.name).join(', ')}</p>}
      {lastLog && (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-2xl bg-pale p-3 text-sm">
          <span>{lastLog.reason}: took {formatQuantity(-lastLog.delta, lastLog.dim)} of {lastLog.name.toLowerCase()}.</span>
          <IconButton icon={Undo2} label="Undo deduction" size={40} onClick={() => void undoLog([lastLog.id])} />
        </div>
      )}

      <div className="mb-3 flex gap-2 overflow-x-auto no-scrollbar">
        {(['all', ...LOCATIONS] as const).map((l) => <Chip key={l} className="capitalize" active={loc === l} onClick={() => setLoc(l)}>{l}</Chip>)}
      </div>

      {!items.length && pantry && (
        <Empty title="Bare shelves." action={<Button icon={Plus} onClick={() => setEditing({})}>Add something</Button>}>Tell me what you've got, and shopping lists and meal ideas get smarter.</Empty>
      )}
      <ul className="grid gap-2 md:grid-cols-2">
        {items.map((p) => {
          const days = p.expiry ? Math.ceil((Date.parse(p.expiry) - now) / DAY) : null;
          return (
            <li key={p.id}>
              <button type="button" data-testid="pantry-item" onClick={() => setEditing(p)} className="flex w-full items-center gap-3 rounded-[1.25rem] bg-white p-3 text-left shadow-[var(--shadow-card)]">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 font-bold">{p.staple && <Pin size={13} aria-label="Staple" />}{p.name}</span>
                  <span className="text-xs capitalize text-muted">{p.location}{!p.canonicalId ? ' · not matched to recipes' : ''}</span>
                </span>
                {days != null && days <= 5 && <Tag tone="warn">{days < 0 ? 'Past date' : days === 0 ? 'Today' : `${days}d`}</Tag>}
                <span className="font-bold tabular-nums">{p.quantity != null ? formatQuantity(p.quantity, p.dim) : 'Have it'}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {editing && <EditSheet key={editing.id ?? 'new'} item={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

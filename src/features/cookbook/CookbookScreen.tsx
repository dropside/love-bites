import { useLiveQuery } from 'dexie-react-hooks';
import { Heart, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { RecipeRow } from '../../components/RecipeBits';
import { Button, Chip, Empty, IconButton, inputClass, selectClass, Sheet, Skeleton, Tag, useFeedback } from '../../components/ui';
import { db, inCookbook, restoreCookbookRow, setInCookbook, uid, type CollectionRow, type CookbookRow } from '../../state/db';
import { useCatalogIndex } from '../../state/hooks';
import { cloudEnabled } from '../../cloud/client';
import { FamilyShelf } from '../family/FamilyBits';

const STARTERS = ['Quick dinners', 'Comfort food', "Kids' favourites", 'Budget meals', 'Baking', 'Weekend cooking', 'Thermomix favourites'];
type Shelf = 'all' | 'shared' | 'try' | 'top' | 'recent';
type Sort = 'added' | 'az' | 'rating' | 'time' | 'cost';

function CollectionsSheet({ open, onClose, collections }: { open: boolean; onClose: () => void; collections: CollectionRow[] }) {
  const { confirm } = useFeedback();
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const add = (n: string) => void db.collections.put({ id: uid(), name: n, createdAt: Date.now() });
  const unused = STARTERS.filter((s) => !collections.some((c) => c.name === s));
  return (
    <Sheet open={open} onClose={onClose} title="Collections">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) add(name.trim()); setName(''); }}>
        <input aria-label="New collection name" placeholder="New collection" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        <IconButton type="submit" icon={Plus} label="Create collection" variant="ink" size={48} disabled={!name.trim()} />
      </form>
      {unused.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{unused.map((s) => <Chip key={s} onClick={() => add(s)}>+ {s}</Chip>)}</div>}
      <ul className="mt-3">
        {collections.map((c) => (
          <li key={c.id} className="flex items-center gap-2 border-b border-line py-2 last:border-0">
            {renaming === c.id ? (
              <input autoFocus aria-label={`Rename ${c.name}`} defaultValue={c.name} className={inputClass} onBlur={(e) => { if (e.target.value.trim()) void db.collections.update(c.id, { name: e.target.value.trim() }); setRenaming(null); }} />
            ) : <span className="flex-1 font-bold">{c.name}</span>}
            <IconButton icon={Pencil} label={`Rename ${c.name}`} variant="ghost" size={40} onClick={() => setRenaming(c.id)} />
            <IconButton icon={Trash2} label={`Delete ${c.name}`} variant="ghost" size={40} onClick={() => {
              void confirm({ title: `Delete ${c.name}?`, body: 'The recipes stay in your cookbook.', danger: true, confirmLabel: 'Delete' }).then(async (ok) => {
                if (!ok) return;
                await db.collections.delete(c.id);
                await db.cookbook.toCollection().modify((row) => { row.collectionIds = row.collectionIds.filter((x) => x !== c.id); });
              });
            }} />
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

export function CookbookScreen() {
  const { index } = useCatalogIndex();
  const { toast } = useFeedback();
  const rows = useLiveQuery(() => db.cookbook.toArray(), []);
  const collections = useLiveQuery(() => db.collections.toArray(), []) ?? [];
  const ratings = useLiveQuery(() => db.ratings.toArray(), []);
  const navigate = useNavigate();
  const [shelf, setShelf] = useState<Shelf | string>('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('added');
  const [manage, setManage] = useState(false);
  const [tag, setTag] = useState('');

  const byId = useMemo(() => new Map(index?.map((r) => [r.id, r])), [index]);
  const stars = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of [...(ratings ?? [])].sort((a, b) => a.at - b.at)) if (r.stars) m.set(r.recipeId, r.stars);
    return m;
  }, [ratings]);
  const notes = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of [...(ratings ?? [])].sort((a, b) => a.at - b.at)) if (r.note) m.set(r.recipeId, r.note);
    return m;
  }, [ratings]);

  const pass = (c: CookbookRow) => {
    if (!inCookbook(c)) return false;
    if (shelf === 'try') return c.wantToTry && !c.cookCount;
    // Top rated comes from your star ratings (older favourite marks still count).
    if (shelf === 'top') return (stars.get(c.recipeId) ?? 0) >= 4 || c.favourite || c.familyFavourite;
    if (shelf === 'recent') return c.lastCookedAt != null;
    if (shelf === 'all') return true;
    return c.collectionIds.includes(shelf);
  };

  const list = useMemo(() => {
    if (!rows) return [];
    const term = q.toLowerCase().trim();
    const out = rows
      .filter(pass)
      .map((c) => ({ c, r: byId.get(c.recipeId) }))
      .filter((x): x is { c: CookbookRow; r: NonNullable<typeof x.r> } => Boolean(x.r))
      .filter((x) => !term || `${x.r.title} ${x.r.ingredientIds.join(' ').replaceAll('-', ' ')} ${notes.get(x.r.id) ?? ''}`.toLowerCase().includes(term))
      .filter((x) => !tag || x.r.tags.includes(tag) || x.r.dietary.includes(tag));
    const by: Record<Sort, (a: (typeof out)[0], b: (typeof out)[0]) => number> = {
      added: (a, b) => (shelf === 'recent' ? (b.c.lastCookedAt ?? 0) - (a.c.lastCookedAt ?? 0) : b.c.addedAt - a.c.addedAt),
      az: (a, b) => a.r.title.localeCompare(b.r.title),
      rating: (a, b) => (stars.get(b.r.id) ?? 0) - (stars.get(a.r.id) ?? 0),
      time: (a, b) => (a.r.totalMinutes ?? 9e9) - (b.r.totalMinutes ?? 9e9),
      cost: (a, b) => (a.r.valueCents ?? 9e9) / a.r.servings - (b.r.valueCents ?? 9e9) / b.r.servings,
    };
    return out.sort(by[sort]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, byId, shelf, q, sort, tag, stars, notes]);

  const shelves: { id: Shelf; label: string }[] = [
        { id: 'all', label: 'All' }, ...(cloudEnabled() ? [{ id: 'shared' as const, label: 'From family' }] : []), { id: 'try', label: 'To try' }, { id: 'top', label: 'Top rated' }, { id: 'recent', label: 'Cooked' },
  ];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="display text-[2rem]">Your cookbook</h1>
        <Button size="sm" icon={Plus} variant="lime" onClick={() => navigate('/recipe/new/edit')}>New</Button>
      </div>
      <input type="search" aria-label="Search your cookbook" placeholder="Search recipes, ingredients, notes" value={q} onChange={(e) => setQ(e.target.value)} className={`${inputClass} rounded-full`} />
      <div className="my-3 flex gap-2 overflow-x-auto no-scrollbar">
        {shelves.map((s) => <Chip key={s.id} active={shelf === s.id} onClick={() => setShelf(s.id)}>{s.label}</Chip>)}
        {collections.map((c) => <Chip key={c.id} active={shelf === c.id} onClick={() => setShelf(c.id)}>{c.name}</Chip>)}
        <Chip onClick={() => setManage(true)}>Collections…</Chip>
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <select aria-label="Sort" className={selectClass} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="added">Newest first</option><option value="az">A to Z</option><option value="rating">Highest rated</option><option value="time">Quickest</option><option value="cost">Cheapest</option>
        </select>
        <select aria-label="Filter" className={selectClass} value={tag} onChange={(e) => setTag(e.target.value)}>
          <option value="">Everything</option><option value="quick">Quick</option><option value="budget">Budget</option><option value="kid-friendly">Kid-friendly</option><option value="baking">Baking</option><option value="vegetarian">Vegetarian</option><option value="gluten-free">Gluten-free</option><option value="freezer-friendly">Freezer-friendly</option>
        </select>
      </div>

      {(!index || !rows) && <Skeleton className="h-64" />}
      {shelf === 'shared' && index && <FamilyShelf byId={byId} />}
      {shelf !== 'shared' && index && rows && !list.length && (
        <Empty title={rows.length ? 'Nothing on this shelf.' : 'Still blank. Very punk.'} action={<Link to="/"><Button icon={Heart}>Go find some food</Button></Link>}>
          {shelf === 'top' ? 'Rate a recipe 4 or 5 stars after cooking it and it shows up here.' : shelf === 'try' ? 'Recipes you save for later in Discover wait here until you cook them.' : shelf === 'recent' ? 'Recipes you cook show up here.' : 'Tap the heart on any recipe, or swipe right, and it lives here.'}
        </Empty>
      )}
      <ul className="grid gap-3 md:grid-cols-2">
        {list.map(({ c, r }) => (
          <li key={r.id} data-testid="cookbook-item">
            <RecipeRow
              r={r}
              sub={
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {stars.get(r.id) && <Tag tone="lime"><Star size={11} fill="currentColor" aria-hidden /> {stars.get(r.id)}</Tag>}
                  {c.wantToTry && !c.cookCount && <Tag>To try</Tag>}
                  {notes.get(r.id) && <span className="marker line-clamp-1 text-sm text-deep">“{notes.get(r.id)}”</span>}
                </div>
              }
              right={<IconButton icon={Heart} label={`Remove ${r.title} from cookbook`} variant="hot" filled aria-pressed onClick={() => void setInCookbook(r.id, false).then((prev) => toast(`Removed ${r.title}.`, { label: 'Undo', run: () => void restoreCookbookRow(r.id, prev) }))} />}
            />
          </li>
        ))}
      </ul>
      <CollectionsSheet open={manage} onClose={() => setManage(false)} collections={collections} />
    </div>
  );
}

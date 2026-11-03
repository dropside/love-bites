import { useLiveQuery } from 'dexie-react-hooks';
import { Layers, LayoutList, Search, SlidersHorizontal } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Empty, ErrorState, IconButton, inputClass, selectClass, Skeleton, Tag, useFeedback } from '../../components/ui';
import { loadMatchIds } from '../../data/catalog';
import { activeFilterCount, applyFilters, applySort, availabilityScore, emptyFilters, orderMeals, profileFrom, rankDeck, titleMatchesFirst, type DiscoverFilters } from '../../domain/ranking';
import type { RecipeSummary } from '../../domain/types';
import { db, inCookbook, weekStartOf } from '../../state/db';
import { useCatalogIndex, useHousehold } from '../../state/hooks';
import { FilterSheet } from './FilterSheet';
import { RecipeList } from './RecipeList';
import { SwipeDeck } from './SwipeDeck';
import { recordSwipe, undoLastSwipe } from './swipeActions';

export function DiscoverScreen() {
  const { index, error } = useCatalogIndex();
  const household = useHousehold();
  const swipes = useLiveQuery(() => db.swipes.toArray(), []);
  const pantry = useLiveQuery(() => db.pantry.toArray(), []);
  const weekMeals = useLiveQuery(() => db.meals.where('weekStart').equals(weekStartOf()).toArray(), []);
  const saved = useLiveQuery(() => db.cookbook.filter(inCookbook).count(), []);
  const lastSwipe = useLiveQuery(() => db.settings.get('lastSwipe'), []);
  const [filters, setFilters] = useState<DiscoverFilters>(() => {
    try {
      return { ...emptyFilters(), ...JSON.parse(sessionStorage.getItem('lb-filters') ?? '{}') };
    } catch {
      return emptyFilters();
    }
  });
  const [sheet, setSheet] = useState(false);
  const [view, setView] = useState<'cards' | 'list'>(() => {
    try {
      return localStorage.getItem('lb-discover-view') === 'list' ? 'list' : 'cards';
    } catch {
      return 'cards';
    }
  });
  const switchView = () => {
    const next = view === 'cards' ? 'list' : 'cards';
    setView(next);
    try {
      localStorage.setItem('lb-discover-view', next);
    } catch { /* just won't be remembered */ }
  };
  const [epoch, setEpoch] = useState(0);
  const { toast } = useFeedback();
  const swipedCount = useRef(0);
  const [matchedIds, setMatchedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    void loadMatchIds().then(setMatchedIds);
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem('lb-filters', JSON.stringify(filters));
    } catch { /* non-essential */ }
  }, [filters]);

  const swiped = useMemo(() => new Set(swipes?.map((s) => s.recipeId)), [swipes]);
  const byId = useMemo(() => new Map(index?.map((r) => [r.id, r])), [index]);
  const pantryIds = useMemo(() => new Set(pantry?.map((p) => p.canonicalId).filter((x): x is string => Boolean(x))), [pantry]);

  const filtered = useMemo(() => {
    if (!index) return [];
    const withLowWaste = filters.tags.includes('low-waste')
      ? index.filter((r) => r.ingredientIds.filter((i) => pantryIds.has(i)).length >= 2)
      : index;
    return applyFilters(withLowWaste, { ...filters, tags: filters.tags.filter((t) => t !== 'low-waste') });
  }, [index, filters, pantryIds]);

  // Ranking is stable within a run of swipes and refreshes periodically, so learning shows up.
  const order = useMemo(() => {
    if (!swipes || !household) return [] as RecipeSummary[];
    const plannedIds = new Set(weekMeals?.flatMap((m) => byId.get(m.recipeId)?.ingredientIds ?? []));
    const ranked = rankDeck(filtered, {
      pantryIds,
      plannedIds,
      matchedIds,
      profile: profileFrom(swipes, byId),
      allergies: household.allergies,
      dislikedIds: new Set(household.dislikedIds),
      dietary: household.dietary,
      maxPerServeCents: household.maxPerServeCents,
      preferredMeals: household.preferredMeals,
    });
    return titleMatchesFirst(applySort(ranked, filters.sort), filters.query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, epoch, household.allergies, household.dislikedIds, household.dietary, household.maxPerServeCents, household.preferredMeals, swipes === undefined, pantryIds, matchedIds]);

  const deck = useMemo(() => order.filter((r) => !swiped.has(r.id)), [order, swiped]);
  const cards = useMemo(() => deck.slice(0, 2).map((recipe) => ({ recipe, availability: availabilityScore(recipe, { pantryIds, matchedIds }) })), [deck, pantryIds, matchedIds]);

  const onSwipe = async (r: RecipeSummary, action: 'love' | 'pass' | 'save') => {
    await recordSwipe(r.id, action);
    const undo = { label: 'Undo', run: () => void undoLastSwipe() };
    if (action === 'love') toast('In the cookbook. Good taste.', view === 'list' ? undo : undefined);
    if (action === 'save') toast('In your cookbook, under To try.', view === 'list' ? undo : undefined);
    if (++swipedCount.current % 12 === 0) setEpoch((e) => e + 1);
  };

  const mealTypes = useMemo(() => orderMeals((index ?? []).flatMap((r) => r.mealTypes)), [index]);

  const hasFilters = activeFilterCount(filters) > 0;
  const hour = new Date().getHours();
  const hello = hour < 11 ? 'Morning, gorgeous.' : hour < 17 ? 'Hey, gorgeous.' : 'Evening, gorgeous.';

  return (
    <div>
      <section aria-label="Your kitchen" className="mb-3">
        <h1 className="display text-[2rem] leading-tight">{hello}</h1>
        <div className="mt-2 flex gap-2 overflow-x-auto no-scrollbar">
          <Link to="/cookbook" className="flex shrink-0 items-center gap-2 rounded-2xl bg-gum px-3.5 py-2"><span className="display text-xl" data-testid="saved-count">{saved ?? 0}</span><span className="text-xs font-bold leading-tight">in your<br />cookbook</span></Link>
          <Link to="/plan" className="flex shrink-0 items-center gap-2 rounded-2xl bg-lime px-3.5 py-2"><span className="display text-xl">{weekMeals?.length ?? 0}</span><span className="text-xs font-bold leading-tight">meals<br />this week</span></Link>
          <div className="flex shrink-0 items-center gap-2 rounded-2xl bg-white px-3.5 py-2 shadow-[var(--shadow-card)]"><span className="display text-xl">{deck.length}</span><span className="text-xs font-bold leading-tight">left to<br />explore</span></div>
        </div>
      </section>

      {view === 'list' && (
        <label className="mb-2 flex items-center gap-2 text-sm font-bold">
          Meal type
          <select aria-label="Meal type" data-testid="list-meal-type" className={`${selectClass} h-11 flex-1 rounded-full capitalize`} value={filters.mealType ?? ''} onChange={(e) => setFilters({ ...filters, mealType: e.target.value || null })}>
            <option value="">All meals</option>
            {mealTypes.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
      )}
      <div className="mb-3 flex gap-2">
        <div className="relative flex-1">
          <Search size={18} aria-hidden className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
          <input type="search" aria-label="Search recipes" placeholder="Search by name or ingredient" value={filters.query} onChange={(e) => setFilters({ ...filters, query: e.target.value })} className={`${inputClass} rounded-full pl-11`} />
        </div>
        <IconButton icon={view === 'cards' ? LayoutList : Layers} label={view === 'cards' ? 'Show as list' : 'Show as cards'} size={48} data-testid="view-toggle" onClick={switchView} />
        <div className="relative">
          <IconButton icon={SlidersHorizontal} label="Filters" variant="ink" size={48} onClick={() => setSheet(true)} />
          {hasFilters && <span className="pointer-events-none absolute -right-1 -top-1"><Tag tone="lime" className="px-2 py-0.5">{activeFilterCount(filters)}</Tag></span>}
        </div>
      </div>

      {error && <ErrorState message={error} onRetry={() => location.reload()} />}
      {!index && !error && <Skeleton className="mx-auto h-[60dvh] max-w-md" />}
      {index && deck.length > 0 && view === 'list' && <RecipeList key={JSON.stringify(filters)} recipes={deck} onSwipe={(r, a) => void onSwipe(r, a)} />}
      {index && deck.length > 0 && view === 'cards' && (
        <SwipeDeck
          cards={cards}
          onSwipe={(r, a) => void onSwipe(r, a)}
          canUndo={Boolean(lastSwipe)}
          onUndo={() => void undoLastSwipe().then((id) => id && toast('Undone. Take two.'))}
        />
      )}
      {index && deck.length === 0 && (
        <Empty
          title={hasFilters ? 'Nothing matches that.' : "You've swiped the lot!"}
          action={hasFilters ? <Button onClick={() => setFilters(emptyFilters())}>Clear filters</Button> : <Link to="/cookbook"><Button>See your cookbook</Button></Link>}
        >
          {hasFilters ? 'Loosen the filters and the good stuff comes back.' : 'More recipes can be added with the expansion tool. Your cookbook is waiting.'}
        </Empty>
      )}
      {index && <FilterSheet open={sheet} onClose={() => setSheet(false)} filters={filters} onChange={setFilters} index={index} resultCount={deck.length} />}
    </div>
  );
}

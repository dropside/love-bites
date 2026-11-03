import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarPlus, Check, ChevronLeft, ChevronRight, Copy, Move, Plus, ShoppingBasket, Sparkles, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { RecipeImage, RecipeRow } from '../../components/RecipeBits';
import { Button, Card, Field, IconButton, inputClass, Sheet, Skeleton, Stepper, Tag, useFeedback } from '../../components/ui';
import { getRecipes } from '../../data/catalog';
import { proposePlan, type PlanProposal, type PlanStrategy } from '../../domain/planner';
import { formatMoney } from '../../domain/pricing';
import type { MealSlot, RecipeSummary } from '../../domain/types';
import { activeSession, addDays, db, inCookbook, isoDate, weekStartOf, type MealEntryRow } from '../../state/db';
import { useBasket, useCatalogIndex, useHousehold } from '../../state/hooks';
import { DAY_NAMES } from './AddToPlanSheet';
import { addMeal, duplicateMeal, moveMeal } from './planActions';

const STRATEGIES: { id: PlanStrategy; label: string; blurb: string }[] = [
  { id: 'balanced', label: 'Plan my week', blurb: 'A sensible mix from your cookbook.' },
  { id: 'budget', label: 'Budget week', blurb: 'Lowest combined shop.' },
  { id: 'quick', label: 'Quick week', blurb: 'Minimal time at the stove.' },
  { id: 'pantry', label: 'Use my pantry', blurb: 'Eat what you already have.' },
  { id: 'favourites', label: 'Family favourites', blurb: 'Your top rated meals.' },
  { id: 'surprise', label: 'Surprise me', blurb: 'Includes some new things.' },
];

function Slot({ day, slot, meals, byId, moving, onAdd, onOpen, onDrop }: { day: number; slot: MealSlot; meals: MealEntryRow[]; byId: Map<string, RecipeSummary>; moving: MealEntryRow | null; onAdd: () => void; onOpen: (m: MealEntryRow) => void; onDrop: (id: string) => void }) {
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); onDrop(e.dataTransfer.getData('text/meal')); }}
      className={`rounded-2xl p-1 transition ${over ? 'bg-lime' : ''}`}
    >
      <p className="mb-1 ml-1 text-[11px] font-extrabold uppercase tracking-wide text-muted">{slot}</p>
      <div className="space-y-1.5">
        {meals.map((m) => {
          const r = byId.get(m.recipeId);
          return (
            <button key={m.id} type="button" data-testid="plan-meal" draggable onDragStart={(e) => e.dataTransfer.setData('text/meal', m.id)} onClick={() => onOpen(m)} className={`flex w-full items-center gap-2 rounded-2xl bg-pale p-1.5 text-left ${m.cooked ? 'opacity-60' : ''}`}>
              <RecipeImage id={m.recipeId} title={r?.title ?? ''} src={r?.image ?? null} className="h-11 w-11 shrink-0 rounded-xl" />
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-sm font-bold leading-tight">{r?.title ?? 'Recipe unavailable'}</span>
                <span className="text-xs text-muted">{m.servings} serves{m.cooked ? ' · cooked' : ''}{m.note ? ' · note' : ''}</span>
              </span>
            </button>
          );
        })}
        <button type="button" onClick={onAdd} aria-label={moving ? `Move here: ${DAY_NAMES[day]} ${slot}` : `Add ${slot} on ${DAY_NAMES[day]}`} className={`flex h-11 w-full items-center justify-center gap-1 rounded-2xl border-2 border-dashed text-sm font-bold ${moving ? 'border-hot bg-pale text-deep' : 'border-line text-muted'}`}>
          {moving ? <><Move size={15} aria-hidden /> Move here</> : <Plus size={16} aria-hidden />}
        </button>
      </div>
    </div>
  );
}

export function PlanScreen() {
  const [week, setWeek] = useState(weekStartOf());
  const { index } = useCatalogIndex();
  const household = useHousehold();
  const navigate = useNavigate();
  const { toast } = useFeedback();
  const meals = useLiveQuery(() => db.meals.where('weekStart').equals(week).toArray(), [week]);
  const cookbook = useLiveQuery(() => db.cookbook.filter(inCookbook).toArray(), []);
  const ratings = useLiveQuery(() => db.ratings.toArray(), []);
  const swipes = useLiveQuery(() => db.swipes.toArray(), []);
  const [addTo, setAddTo] = useState<{ day: number; slot: MealSlot } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [moving, setMoving] = useState<{ meal: MealEntryRow; copy: boolean } | null>(null);
  const [planning, setPlanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState<PlanProposal | null>(null);
  const [q, setQ] = useState('');

  const byId = useMemo(() => new Map(index?.map((r) => [r.id, r])), [index]);
  const entries = useMemo(() => meals?.map((m) => ({ recipeId: m.recipeId, servings: m.servings })), [meals]);
  const { basket, ctx } = useBasket(entries);
  const slots: MealSlot[] = household.showBreakfastSnacks ? ['breakfast', 'lunch', 'dinner', 'snack'] : ['lunch', 'dinner'];
  const openMeal = meals?.find((m) => m.id === open) ?? null;
  const savedRecipes = useMemo(() => (cookbook ?? []).map((c) => byId.get(c.recipeId)).filter((r): r is RecipeSummary => Boolean(r)), [cookbook, byId]);
  const pickList = useMemo(() => {
    const terms = q.toLowerCase().trim();
    const usable = savedRecipes.filter((r) => r.completeness !== 'discovery-only');
    if (!terms) return usable.slice(0, 40);
    return (index ?? []).filter((r) => r.completeness !== 'discovery-only' && r.title.toLowerCase().includes(terms)).slice(0, 30);
  }, [savedRecipes, index, q]);

  const t = basket?.totals;
  const totalMinutes = (meals ?? []).reduce((n, m) => n + (byId.get(m.recipeId)?.totalMinutes ?? 0), 0);
  const totalServes = (meals ?? []).reduce((n, m) => n + m.servings, 0);
  const budget = household.weeklyBudgetCents;
  const dinnerCount = (meals ?? []).filter((m) => m.slot === 'dinner').length;

  const generate = async (strategy: PlanStrategy) => {
    if (!ctx || !index) return;
    setBusy(true);
    await new Promise((r) => setTimeout(r, 30));
    const withinCap = (r: RecipeSummary) => household.maxPerServeCents == null || r.valueCents == null || r.valueCents / r.servings <= household.maxPerServeCents;
    const preferred = (r: RecipeSummary) => household.preferredMeals.some((m) => r.mealTypes.includes(m));
    const saved = savedRecipes.filter((r) => r.completeness === 'complete' && withinCap(r)).sort((a, b) => Number(preferred(b)) - Number(preferred(a)));
    const passed = new Set(swipes?.filter((s) => s.action === 'pass').map((s) => s.recipeId));
    let pool = saved;
    // Surprises and small cookbooks draw on well-priced catalogue recipes she hasn't rejected.
    if (strategy === 'surprise' || saved.length < household.mealsPerWeek + 3) {
      const extra = index
        .filter((r) => r.completeness === 'complete' && r.valueCents != null && !passed.has(r.id) && !saved.includes(r) && withinCap(r) && (household.preferredMeals.length ? preferred(r) : r.mealTypes.includes('dinner')) && !r.allergens.some((a) => household.allergies.includes(a)) && !r.hasUnknownIngredients && household.dietary.every((d) => r.dietary.includes(d)) && !r.ingredientIds.some((i) => household.dislikedIds.includes(i)))
        .sort((a, b) => (a.valueCents! / a.servings) - (b.valueCents! / b.servings))
        .slice(0, 400);
      const step = Math.max(1, Math.floor(extra.length / 30));
      pool = [...saved, ...extra.filter((_, i) => i % step === (Date.now() % step))].slice(0, 45);
    } else {
      pool = saved.slice(0, 45);
    }
    const recipes = await getRecipes(pool.map((r) => r.id));
    const options = recipes.map((recipe) => ({ recipe, summary: byId.get(recipe.id)! })).filter((o) => o.summary);
    const stars: Record<string, number> = {};
    for (const r of ratings ?? []) if (r.stars) stars[r.recipeId] = r.stars;
    const p = proposePlan(options, { strategy, meals: household.mealsPerWeek, servings: household.defaultServings, budgetCents: household.weeklyBudgetCents, maxMinutes: household.maxMinutes, ratings: stars, seed: Date.now() % 1000 }, ctx);
    setBusy(false);
    if (!p) toast('Save a few complete recipes first, then I can plan.');
    setProposal(p);
  };

  const approve = async () => {
    if (!proposal) return;
    const taken = new Set((meals ?? []).filter((m) => m.slot === 'dinner').map((m) => m.day));
    let day = 0;
    const added: string[] = [];
    for (const r of proposal.picks) {
      while (taken.has(day) && day < 6) day++;
      added.push(await addMeal(week, day, 'dinner', r.id, household.defaultServings));
      taken.add(day);
    }
    setProposal(null);
    setPlanning(false);
    toast('Week sorted. Check out the plan.', { label: 'Undo', run: () => void db.meals.bulkDelete(added) });
  };

  const onSlotTap = (day: number, slot: MealSlot) => {
    if (moving) {
      void (moving.copy ? duplicateMeal(moving.meal, day, slot) : moveMeal(moving.meal.id, day, slot));
      setMoving(null);
    } else {
      setQ('');
      setAddTo({ day, slot });
    }
  };

  return (
    <div>
      <h1 className="display text-[2rem]">Plan</h1>
      <div className="my-3 flex items-center justify-between rounded-full bg-white p-1 shadow-[var(--shadow-card)]">
        <IconButton icon={ChevronLeft} label="Previous week" variant="ghost" onClick={() => setWeek(isoDate(addDays(week, -7)))} />
        <button type="button" className="font-bold" onClick={() => setWeek(weekStartOf())} data-testid="week-label">
          {week === weekStartOf() ? 'This week' : `Week of ${addDays(week, 0).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })}`}
        </button>
        <IconButton icon={ChevronRight} label="Next week" variant="ghost" onClick={() => setWeek(isoDate(addDays(week, 7)))} />
      </div>

      <section aria-label="Budget" className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="col-span-2 bg-gum lg:col-span-1">
          <p className="text-sm font-bold">Estimated checkout</p>
          <p className="display text-4xl tabular-nums" data-testid="plan-total">{basket ? formatMoney(t?.checkoutCents ?? 0) : '…'}</p>
          {budget != null && t && (
            <p className={`mt-1 text-sm font-bold ${t.checkoutCents > budget ? 'text-danger' : ''}`}>
              {t.checkoutCents > budget ? `${formatMoney(t.checkoutCents - budget)} over budget` : `${formatMoney(budget - t.checkoutCents)} left of ${formatMoney(budget)}`}
            </p>
          )}
          {household.dinnerBudgetCents != null && t && dinnerCount > 0 && t.checkoutCents / Math.max(1, meals?.length ?? 1) * dinnerCount > household.dinnerBudgetCents && (
            <p className="mt-1 text-xs font-bold text-danger">Dinners are likely over your {formatMoney(household.dinnerBudgetCents)} dinner budget.</p>
          )}
          <p className="mt-1 text-xs">An estimate from stored product prices, not a quote.</p>
        </Card>
        <Card className="p-3"><p className="text-xs font-bold text-muted">Per serve</p><p className="display text-2xl tabular-nums">{t && totalServes ? formatMoney(Math.round(t.valueCents / totalServes)) : '—'}</p></Card>
        <Card className="p-3"><p className="text-xs font-bold text-muted">Pantry saves</p><p className="display text-2xl tabular-nums">{t ? formatMoney(t.pantrySavingCents) : '—'}</p></Card>
        <Card className="p-3"><p className="text-xs font-bold text-muted">Leftovers worth</p><p className="display text-2xl tabular-nums">{t ? formatMoney(t.leftoverValueCents) : '—'}</p></Card>
        <Card className="p-3"><p className="text-xs font-bold text-muted">{meals?.length ?? 0} meals</p><p className="display text-2xl tabular-nums">{totalMinutes >= 60 ? `${+(totalMinutes / 60).toFixed(1)} hr` : `${totalMinutes} min`}</p></Card>
      </section>

      <div className="mb-4 flex gap-2">
        <Button icon={Sparkles} variant="lime" className="flex-1" onClick={() => { setProposal(null); setPlanning(true); }}>Smart plan</Button>
        <Button icon={ShoppingBasket} className="flex-1" disabled={!meals?.length} onClick={() => { void activeSession().then((s) => db.sessions.update(s.id, { weekStart: week })).then(() => navigate('/shop')); }} data-testid="shop-this-week">Shop this</Button>
      </div>

      {moving && (
        <div className="sticky top-16 z-20 mb-3 flex items-center justify-between rounded-full bg-ink py-2 pl-5 pr-2 text-sm font-bold text-white">
          {moving.copy ? 'Tap where to copy it' : 'Tap where to move it'}
          <IconButton icon={X} label="Cancel move" variant="ghost" size={36} onClick={() => setMoving(null)} />
        </div>
      )}

      {!meals && <Skeleton className="h-96" />}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {DAY_NAMES.map((name, day) => {
          const date = addDays(week, day);
          const isToday = isoDate(date) === isoDate(new Date());
          return (
            <Card key={name} className="p-3" data-testid={`day-${day}`}>
              <div className="mb-1 flex items-baseline gap-2">
                <h2 className={`display text-xl ${isToday ? 'text-deep' : ''}`}>{name}</h2>
                <span className="text-xs font-bold text-muted">{date.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })}</span>
                {isToday && <Tag tone="lime" className="py-0">Today</Tag>}
              </div>
              <div className={`grid gap-2 ${slots.length === 2 ? 'grid-cols-2' : 'grid-cols-2'}`}>
                {slots.map((slot) => (
                  <Slot key={slot} day={day} slot={slot} byId={byId} moving={moving?.meal ?? null} meals={(meals ?? []).filter((m) => m.day === day && m.slot === slot)} onAdd={() => onSlotTap(day, slot)} onOpen={(m) => setOpen(m.id)} onDrop={(id) => void moveMeal(id, day, slot)} />
                ))}
              </div>
            </Card>
          );
        })}
      </div>

      <Sheet open={Boolean(addTo)} onClose={() => setAddTo(null)} title={addTo ? `${DAY_NAMES[addTo.day]} ${addTo.slot}` : ''}>
        <input type="search" aria-label="Find a recipe" placeholder="Search any recipe, or pick a saved one" value={q} onChange={(e) => setQ(e.target.value)} className={inputClass} />
        <div className="mt-3 space-y-2">
          {pickList.map((r) => (
            <button key={r.id} type="button" data-testid="pick-recipe" className="flex w-full items-center gap-3 rounded-2xl bg-pale p-2 text-left" onClick={() => { void addMeal(week, addTo!.day, addTo!.slot, r.id, household.defaultServings); setAddTo(null); }}>
              <RecipeImage id={r.id} title={r.title} src={r.image} className="h-12 w-12 shrink-0 rounded-xl" />
              <span className="font-bold leading-tight">{r.title}</span>
            </button>
          ))}
          {!pickList.length && <p className="py-6 text-center text-sm text-muted">No saved recipes yet. <Link to="/" className="font-bold underline">Go swipe some</Link> or search above.</p>}
        </div>
      </Sheet>

      {openMeal && (
        <Sheet open onClose={() => setOpen(null)} title={byId.get(openMeal.recipeId)?.title ?? 'Meal'}>
          <div className="space-y-4">
            <div className="flex items-center justify-between"><span className="text-sm font-bold">Servings</span><Stepper label="meal servings" value={openMeal.servings} onChange={(n) => void db.meals.update(openMeal.id, { servings: n })} /></div>
            <Field label="Note"><input className={inputClass} value={openMeal.note} placeholder="Double the sauce…" onChange={(e) => void db.meals.update(openMeal.id, { note: e.target.value })} /></Field>
            <Link to={`/recipe/${openMeal.recipeId}`} className="block"><Button variant="white" className="w-full">Open recipe</Button></Link>
            <div className="grid grid-cols-2 gap-2">
              <Button variant={openMeal.cooked ? 'lime' : 'ghost'} icon={Check} onClick={() => void db.meals.update(openMeal.id, { cooked: !openMeal.cooked })}>{openMeal.cooked ? 'Cooked' : 'Mark cooked'}</Button>
              <Button variant="ghost" icon={Move} onClick={() => { setMoving({ meal: openMeal, copy: false }); setOpen(null); }}>Move</Button>
              <Button variant="ghost" icon={Copy} onClick={() => { setMoving({ meal: openMeal, copy: true }); setOpen(null); }}>Duplicate</Button>
              <Button variant="ghost" icon={Trash2} onClick={() => { const meal = openMeal; void db.meals.delete(meal.id).then(() => toast('Removed from the plan.', { label: 'Undo', run: () => void db.meals.put(meal) })); setOpen(null); }}>Remove</Button>
            </div>
          </div>
        </Sheet>
      )}

      <Sheet open={planning} onClose={() => { setPlanning(false); setProposal(null); }} title={proposal ? 'How about this?' : 'Smart plan'} footer={proposal ? <div className="mb-1 flex gap-2"><Button variant="ghost" className="flex-1" onClick={() => setProposal(null)}>Try another</Button><Button className="flex-1" data-testid="approve-plan" onClick={() => void approve()}>Use this</Button></div> : undefined}>
        {!proposal && (
          <div className="grid grid-cols-2 gap-2">
            {STRATEGIES.map((s) => (
              <button key={s.id} type="button" disabled={busy || !ctx} onClick={() => void generate(s.id)} className="rounded-3xl bg-pale p-4 text-left disabled:opacity-50">
                <span className="display block text-lg leading-tight">{s.label}</span>
                <span className="text-xs text-muted">{s.blurb}</span>
              </button>
            ))}
            {busy && <p role="status" className="col-span-2 text-center text-sm font-bold">Doing the maths on your whole basket…</p>}
          </div>
        )}
        {proposal && (
          <div className="space-y-3">
            <Card className="bg-gum">
              <p className="text-sm font-bold">Whole-week shop</p>
              <p className="display text-3xl">~{formatMoney(proposal.checkoutCents)}</p>
              {proposal.overBudget && <p className="text-sm font-bold text-danger">Over your budget.</p>}
            </Card>
            {proposal.explanations.map((e) => <p key={e} className="flex gap-2 text-sm font-semibold"><CalendarPlus size={16} aria-hidden className="mt-0.5 shrink-0" /> {e}</p>)}
            <div className="space-y-2">{proposal.picks.map((r) => <RecipeRow key={r.id} r={r} />)}</div>
          </div>
        )}
      </Sheet>
    </div>
  );
}

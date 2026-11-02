import { useMemo } from 'react';
import { Button, Chip, Field, selectClass, Sheet } from '../../components/ui';
import { emptyFilters, type DiscoverFilters } from '../../domain/ranking';
import type { RecipeSummary } from '../../domain/types';

const TAGS: [string, string][] = [
  ['quick', 'Quick'], ['budget', 'Budget'], ['one-pot', 'One-pot'], ['kid-friendly', 'Kid-friendly'], ['freezer-friendly', 'Freezer-friendly'],
  ['baking', 'Baking'], ['pantry-friendly', 'Pantry-friendly'], ['low-waste', 'Low-waste'],
];
const DIETS: [string, string][] = [['vegetarian', 'Vegetarian'], ['vegan', 'Vegan'], ['gluten-free', 'Gluten-free'], ['dairy-free', 'Dairy-free'], ['nut-free', 'Nut-free']];
const TIMES = [15, 30, 45, 60, 90];

function NumSelect({ label, value, options, onChange, unit }: { label: string; value: number | null; options: number[]; onChange: (n: number | null) => void; unit: (n: number) => string }) {
  return (
    <Field label={label}>
      <select className={selectClass} value={value ?? ''} onChange={(e) => onChange(e.target.value ? +e.target.value : null)}>
        <option value="">Any</option>
        {options.map((o) => <option key={o} value={o}>{unit(o)}</option>)}
      </select>
    </Field>
  );
}

export function FilterSheet({ open, onClose, filters, onChange, index, resultCount }: { open: boolean; onClose: () => void; filters: DiscoverFilters; onChange: (f: DiscoverFilters) => void; index: RecipeSummary[]; resultCount: number }) {
  const facets = useMemo(() => {
    const count = (get: (r: RecipeSummary) => (string | null)[]) => {
      const m = new Map<string, number>();
      for (const r of index) for (const k of get(r)) if (k) m.set(k, (m.get(k) ?? 0) + 1);
      return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    };
    return { cuisines: count((r) => [r.cuisine]).slice(0, 40).sort(), meals: count((r) => r.mealTypes), mains: count((r) => [r.mainIngredient]) };
  }, [index]);
  const set = (p: Partial<DiscoverFilters>) => onChange({ ...filters, ...p });
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const dollars = (n: number) => `Under $${n / 100}`;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Filter the feed"
      footer={
        <div className="flex gap-3 pb-1">
          <Button variant="ghost" className="flex-1" onClick={() => onChange(emptyFilters())}>Clear all</Button>
          <Button className="flex-1" data-testid="apply-filters" onClick={onClose}>Show {resultCount}</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Sort by">
          <select className={selectClass} value={filters.sort} onChange={(e) => set({ sort: e.target.value as DiscoverFilters['sort'] })}>
            <option value="best">Best for you</option>
            <option value="cheapest">Cheapest per serve</option>
            <option value="quickest">Quickest</option>
            <option value="az">A to Z</option>
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Main ingredient">
            <select aria-label="Main ingredient" className={selectClass} value={filters.mainIngredient ?? ''} onChange={(e) => set({ mainIngredient: e.target.value || null })}>
              <option value="">Any</option>
              {facets.mains.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Meal type">
            <select aria-label="Meal type" className={selectClass} value={filters.mealType ?? ''} onChange={(e) => set({ mealType: e.target.value || null })}>
              <option value="">Any</option>
              {facets.meals.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Cuisine">
            <select className={selectClass} value={filters.cuisine ?? ''} onChange={(e) => set({ cuisine: e.target.value || null })}>
              <option value="">Any</option>
              {facets.cuisines.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Servings">
            <select className={selectClass} value={filters.servings ?? ''} onChange={(e) => set({ servings: e.target.value ? +e.target.value : null })}>
              <option value="">Any</option>
              {[2, 3, 4, 5, 6, 8].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
          <NumSelect label="Total time" value={filters.maxTotal} options={TIMES} onChange={(maxTotal) => set({ maxTotal })} unit={(n) => `${n} min or less`} />
          <NumSelect label="Cook time" value={filters.maxCook} options={TIMES} onChange={(maxCook) => set({ maxCook })} unit={(n) => `${n} min or less`} />
          <NumSelect label="Prep time" value={filters.maxPrep} options={[5, 10, 15, 20, 30]} onChange={(maxPrep) => set({ maxPrep })} unit={(n) => `${n} min or less`} />
          <NumSelect label="Recipe cost" value={filters.maxPriceCents} options={[1000, 1500, 2000, 3000, 4000]} onChange={(maxPriceCents) => set({ maxPriceCents })} unit={dollars} />
          <NumSelect label="Cost per serve" value={filters.maxPerServeCents} options={[200, 300, 500, 800, 1200]} onChange={(maxPerServeCents) => set({ maxPerServeCents })} unit={dollars} />
        </div>
        <fieldset>
          <legend className="mb-1.5 text-sm font-bold">Vibe</legend>
          <div className="flex flex-wrap gap-2">
            {TAGS.map(([k, label]) => <Chip key={k} active={filters.tags.includes(k)} onClick={() => set({ tags: toggle(filters.tags, k) })}>{label}</Chip>)}
            <Chip active={filters.thermomix} onClick={() => set({ thermomix: !filters.thermomix })}>Thermomix</Chip>
            <Chip active={filters.onSpecial} onClick={() => set({ onSpecial: !filters.onSpecial })}>On special</Chip>
            <Chip active={filters.fullRecipesOnly} onClick={() => set({ fullRecipesOnly: !filters.fullRecipesOnly })}>Full recipes only</Chip>
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-1.5 text-sm font-bold">Dietary</legend>
          <div className="flex flex-wrap gap-2">
            {DIETS.map(([k, label]) => <Chip key={k} active={filters.dietary.includes(k)} onClick={() => set({ dietary: toggle(filters.dietary, k) })}>{label}</Chip>)}
          </div>
          <p className="mt-2 text-xs text-muted">Dietary filters only show recipes where every ingredient was identified. Always check labels.</p>
        </fieldset>
      </div>
    </Sheet>
  );
}

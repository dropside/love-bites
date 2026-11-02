import { useLiveQuery } from 'dexie-react-hooks';
import { Archive, ArrowLeft, Baby, CalendarPlus, ChefHat, ExternalLink, FolderPlus, Heart, Pencil, Play, Share2, ShoppingBasket, Star, TimerIcon, TriangleAlert } from 'lucide-react';
import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CompletenessTag, minutesLabel, RecipeImage, ThermomixTag } from '../../components/RecipeBits';
import { Button, Card, Chip, Empty, IconButton, Sheet, Skeleton, Stepper, Tag, useFeedback } from '../../components/ui';
import { scaleIngredient } from '../../domain/ingredients';
import { formatMoney } from '../../domain/pricing';
import type { BasketLine } from '../../domain/basket';
import type { Product, Recipe, RecipeIngredient } from '../../domain/types';
import { formatQuantity, fraction } from '../../domain/units';
import { activeSession, db, patchCookbook, uid } from '../../state/db';
import { useBasket, useHousehold, useRecipe } from '../../state/hooks';
import { LovedBy, ShareWithFamilyButton } from '../family/FamilyBits';
import { AddToPlanSheet } from '../plan/AddToPlanSheet';
import { ProductPicker, productSize } from '../shop/ProductPicker';

export function ingredientAmount(i: RecipeIngredient): string {
  if (i.quantity == null) return i.unit ?? '';
  if (i.unit === 'ml' && i.quantity <= 60) {
    if (i.quantity % 15 === 0) return `${fraction(i.quantity / 15)} tbsp`;
    if (i.quantity % 5 === 0 || i.quantity < 5) return `${fraction(i.quantity / 5)} tsp`;
  }
  return formatQuantity(i.quantity, i.unit);
}

/** Bold the ingredients named in a step, so she can see them while cooking. */
export function highlightStep(text: string, ingredients: RecipeIngredient[]): ReactNode {
  const words = [...new Set(ingredients.flatMap((i) => [i.name.toLowerCase().split(' ').at(-1) ?? '']).filter((w) => w.length > 2))];
  if (!words.length) return text;
  const re = new RegExp(`\\b(${words.map((w) => w.replace(/[^a-z0-9]/g, '')).filter(Boolean).join('|')})s?\\b`, 'gi');
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    out.push(text.slice(last, m.index));
    out.push(<strong key={m.index} className="rounded bg-pale px-0.5 font-bold">{m[0]}</strong>);
    last = (m.index ?? 0) + m[0].length;
  }
  out.push(text.slice(last));
  return out;
}

export const timerLabel = (s: number) => (s >= 3600 ? `${+(s / 3600).toFixed(1)} hr` : s >= 60 ? `${Math.round(s / 60)} min` : `${s} sec`);

function IngredientRow({ ing, line, products, onPick }: { ing: RecipeIngredient; line?: BasketLine; products?: Map<string, Product>; onPick: () => void }) {
  const product = line?.plan?.lines[0]?.productId ?? null;
  return (
    <li data-testid="ingredient" className="border-b border-line py-3 last:border-0">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-bold leading-tight">
          <span className="text-deep" data-testid="ingredient-amount">{ingredientAmount(ing)}</span> {ing.name}
          {ing.optional && <span className="text-sm font-normal text-muted"> (optional)</span>}
        </p>
      </div>
      {!ing.original.toLowerCase().endsWith(ing.name.toLowerCase()) && <p className="text-xs text-muted">{ing.original}</p>}
      <IngredientProduct line={line} product={product ? products?.get(product) : null} onPick={onPick} />
    </li>
  );
}

function IngredientProduct({ line, product: p, onPick }: { line?: BasketLine; product?: Product | null; onPick: () => void }) {
  if (!line) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
      {line.assumedStaple && <Tag tone="lime" className="py-0.5">At home</Tag>}
      {!line.assumedStaple && line.pantryUsed > 0 && line.dim && <Tag tone="lime" className="py-0.5">{formatQuantity(line.pantryUsed, line.dim)} in pantry</Tag>}
      {p && (
        <button type="button" onClick={onPick} className="font-semibold underline decoration-gum underline-offset-2">
          <span className="capitalize">{p.name}</span> · {productSize(p)} · {formatMoney(p.priceCents)}{p.variable ? '/kg' : ''}
        </button>
      )}
      {!p && !line.assumedStaple && line.toBuy > 0 && <button type="button" onClick={onPick} className="font-bold text-[#7A3B00] underline">No product yet: pick one</button>}
      {line.needsReview && <Tag tone="warn" className="py-0.5">Check amount</Tag>}
    </div>
  );
}

function RateSheet({ open, onClose, recipeId }: { open: boolean; onClose: () => void; recipeId: string }) {
  const [stars, setStars] = useState<number | null>(null);
  const [note, setNote] = useState('');
  return (
    <Sheet open={open} onClose={onClose} title="How was it?" footer={<Button className="mb-1 w-full" data-testid="save-rating" disabled={!stars && !note.trim()} onClick={() => { void db.ratings.put({ id: uid(), recipeId, stars, note: note.trim(), at: Date.now() }); onClose(); }}>Save</Button>}>
      <StarPicker value={stars} onChange={setStars} />
      <div className="my-3 flex flex-wrap gap-2">{['Kids loved it.', 'Use less garlic next time.', 'Double the sauce.', 'Make it again.'].map((n) => <Chip key={n} onClick={() => setNote(n)}>{n}</Chip>)}</div>
      <textarea aria-label="Notes" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Better with chicken thighs…" className="w-full rounded-2xl border border-line p-3 text-base" />
    </Sheet>
  );
}

export function StarPicker({ value, onChange }: { value: number | null; onChange: (n: number) => void }) {
  return (
    <div role="group" aria-label="Rating" className="flex justify-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" aria-label={`${n} stars`} aria-pressed={value === n} onClick={() => onChange(n)} className="flex h-12 w-12 items-center justify-center">
          <Star size={32} aria-hidden fill={(value ?? 0) >= n ? '#FF0A8C' : 'none'} className={(value ?? 0) >= n ? 'text-hot' : 'text-muted'} />
        </button>
      ))}
    </div>
  );
}

function ThermomixNotice({ recipe }: { recipe: Recipe }) {
  if (recipe.thermomix === 'none') return null;
  return (
    <p className="mt-3 flex gap-2 rounded-2xl bg-pale p-3 text-sm">
      <ChefHat size={18} aria-hidden className="mt-0.5 shrink-0" />
      {recipe.thermomix === 'native-source'
        ? "Written for Thermomix by the original author. Follow their settings on the source page. This app can't control your machine."
        : "This style of dish often suits a Thermomix, but these steps have no verified machine settings. Use your own judgement or the appliance's guidance."}
    </p>
  );
}

function RecipeBody({ recipe }: { recipe: Recipe }) {
  const household = useHousehold();
  const navigate = useNavigate();
  const { toast, confirm } = useFeedback();
  const [servings, setServings] = useState(recipe.servings);
  const [planOpen, setPlanOpen] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  const [collectionsOpen, setCollectionsOpen] = useState(false);
  const [picker, setPicker] = useState<string | null>(null);
  const book = useLiveQuery(() => db.cookbook.get(recipe.id), [recipe.id]);
  const collections = useLiveQuery(() => db.collections.toArray(), []) ?? [];
  const ratings = useLiveQuery(() => db.ratings.where('recipeId').equals(recipe.id).toArray(), [recipe.id]);
  const session = useLiveQuery(() => db.cooking.get(recipe.id), [recipe.id]);

  const entries = useMemo(() => [{ recipeId: recipe.id, servings }], [recipe.id, servings]);
  const { basket, data, ctx } = useBasket(entries);
  const factor = servings / recipe.servings;
  const scaled = useMemo(() => recipe.ingredients.map((i) => scaleIngredient(i, factor)), [recipe.ingredients, factor]);
  const lines = useMemo(() => new Map(basket?.lines.map((l) => [l.canonicalId ?? l.key, l])), [basket]);
  const reliable = recipe.completeness === 'complete' || recipe.completeness === 'ingredients-verified';
  const pickerLine = picker ? basket?.lines.find((l) => l.key === picker) : null;
  const mins = minutesLabel(recipe);
  const sortedRatings = (ratings ?? []).slice().sort((a, b) => b.at - a.at);

  const addToList = async () => {
    const s = await activeSession();
    await db.shopExtras.put({ id: uid(), sessionId: s.id, recipeId: recipe.id, title: recipe.title, servings });
    toast('Ingredients added to your list.', { label: 'See list', run: () => navigate('/shop') });
  };
  const share = async () => {
    const url = recipe.source.url ?? location.href;
    try {
      if (navigator.share) await navigator.share({ title: recipe.title, url });
      else {
        await navigator.clipboard.writeText(url);
        toast('Link copied.');
      }
    } catch { /* share cancelled */ }
  };
  const editCopy = async () => {
    if (recipe.userOwned) return navigate(`/recipe/${recipe.id}/edit`);
    const id = `user-${uid()}`;
    await db.userRecipes.put({ ...recipe, id, userOwned: true, basedOn: recipe.id, title: recipe.title, source: { ...recipe.source, rights: 'user-owned', provenance: `Personal copy of ${recipe.source.name} recipe` }, updatedAt: Date.now() });
    await patchCookbook(id, { saved: true });
    navigate(`/recipe/${id}/edit`);
  };

  return (
    <article>
      <div className="relative -mx-4 -mt-1 md:mx-0 md:overflow-hidden md:rounded-[2rem]">
        <RecipeImage id={recipe.id} title={recipe.title} src={recipe.image?.url ?? null} className="h-72 w-full md:h-96" large />
        <IconButton icon={ArrowLeft} label="Back" className="absolute left-4 top-3 shadow-lg" onClick={() => navigate(-1)} />
        <div className="absolute right-4 top-3 flex gap-2">
          <IconButton icon={Heart} label={book?.favourite ? 'Remove favourite' : 'Favourite'} aria-pressed={Boolean(book?.favourite)} variant={book?.favourite ? 'hot' : 'white'} className="shadow-lg" onClick={() => void patchCookbook(recipe.id, { favourite: !book?.favourite, saved: true })} />
          <IconButton icon={FolderPlus} label="Add to collection" className="shadow-lg" onClick={() => setCollectionsOpen(true)} />
        </div>
      </div>

      <div className="relative -mt-8 rounded-[2rem] bg-bg px-1 pt-5">
        <div className="mb-2 flex flex-wrap gap-1.5">
          <CompletenessTag r={recipe} />
          <ThermomixTag r={recipe} />
          <LovedBy recipeId={recipe.id} />
          {recipe.cuisine && <Tag>{recipe.cuisine}</Tag>}
          {recipe.tags.includes('kid-friendly') && <Tag tone="lime"><Baby size={12} aria-hidden /> Kid-friendly</Tag>}
          {recipe.dietary.map((d) => <Tag key={d}>{d}</Tag>)}
        </div>
        <h1 className="display text-[2.1rem] leading-[1.05]" data-testid="recipe-title">{recipe.title}</h1>
        {recipe.description && <p className="mt-2 text-muted">{recipe.description}</p>}

        <dl className="mt-4 grid grid-cols-4 gap-2 text-center">
          {[
            ['Prep', recipe.prepMinutes != null ? `${recipe.timeEstimated ? '~' : ''}${recipe.prepMinutes}m` : '—'],
            ['Cook', recipe.cookMinutes != null ? `${recipe.timeEstimated ? '~' : ''}${recipe.cookMinutes}m` : '—'],
            ['Total', mins ?? '—'],
            ['Cost', basket && reliable && basket.totals.pricedLines ? `~${formatMoney(basket.totals.valueCents)}` : '—'],
          ].map(([k, v]) => <div key={k} className="rounded-2xl bg-white p-2 shadow-[var(--shadow-card)]"><dt className="text-[11px] font-bold text-muted">{k}</dt><dd className="font-extrabold tabular-nums">{v}</dd></div>)}
        </dl>
        {recipe.timeEstimated && recipe.totalMinutes != null && <p className="mt-1 text-xs text-muted">Times are estimates from the steps. The source didn't state them.</p>}
        {reliable && basket && <p className="mt-1 text-xs text-muted">Cost is the value of what's used, from stored Woolworths prices. It's an estimate.</p>}

        <div className="mt-4 grid grid-cols-2 gap-2">
          {recipe.steps.length > 0 && <Button size="lg" icon={Play} variant="hot" className="col-span-2" onClick={() => navigate(`/recipe/${recipe.id}/cook`)} data-testid="start-cooking">{session ? 'Resume cooking' : 'Start cooking'}</Button>}
          {recipe.source.url && recipe.completeness === 'discovery-only' && (
            <a href={recipe.source.url} target="_blank" rel="noreferrer" className="col-span-2"><Button size="lg" icon={ExternalLink} variant="hot" className="w-full">Open the full recipe</Button></a>
          )}
          {reliable && <Button icon={CalendarPlus} data-testid="add-to-plan" onClick={() => setPlanOpen(true)}>Add to plan</Button>}
          {reliable && <Button icon={ShoppingBasket} variant="lime" data-testid="add-to-list" onClick={() => void addToList()}>Add to list</Button>}
          <Button variant="white" icon={book?.saved ? Archive : Heart} data-testid="save-recipe" onClick={() => void (book?.saved ? confirm({ title: 'Archive this recipe?', body: "It leaves your cookbook but stays in the archive.", confirmLabel: 'Archive' }).then((ok) => { if (ok) void patchCookbook(recipe.id, { archived: true, saved: false }); }) : patchCookbook(recipe.id, { saved: true, archived: false }))}>{book?.saved ? 'Archive' : 'Save recipe'}</Button>
          <Button variant="white" icon={Share2} onClick={() => void share()}>Share link</Button>
          <ShareWithFamilyButton recipe={recipe} />
          {reliable && <Button variant="white" icon={Pencil} onClick={() => void editCopy()}>{recipe.userOwned ? 'Edit recipe' : 'Edit my copy'}</Button>}
          {reliable && <Button variant="white" icon={Star} onClick={() => setRateOpen(true)}>Rate / note</Button>}
        </div>

        {sortedRatings.length > 0 && (
          <Card className="mt-4 bg-lime">
            <h2 className="display text-xl">Last time</h2>
            {sortedRatings.slice(0, 4).map((r) => (
              <p key={r.id} className="mt-1"><span className="font-bold">{r.stars ? `${'★'.repeat(r.stars)} ` : ''}</span><span className="marker text-lg">{r.note}</span></p>
            ))}
          </Card>
        )}

        {recipe.issues.length > 0 && recipe.completeness === 'needs-review' && (
          <p className="mt-4 flex gap-2 rounded-2xl bg-[#FFE3C2] p-3 text-sm text-[#7A3B00]"><TriangleAlert size={18} aria-hidden className="shrink-0" /> {recipe.issues.join(' ')} Double-check against the source.</p>
        )}

        {recipe.ingredients.length > 0 ? (
          <section className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="display text-2xl">Ingredients</h2>
              <Stepper label="servings" value={servings} max={40} onChange={setServings} />
            </div>
            {!recipe.servingsVerified && <p className="mb-2 text-xs text-muted">The source didn't say how many this serves. {recipe.servings} is an estimate, so check amounts look right.</p>}
            <Card className="py-1">
              <ul>
                {scaled.map((ing) => {
                  const line = lines.get(ing.canonicalId ?? `text:${ing.name.toLowerCase()}`);
                  return <IngredientRow key={ing.id} ing={ing} line={line} products={data?.products} onPick={() => line && setPicker(line.key)} />;
                })}
              </ul>
            </Card>
          </section>
        ) : (
          <div className="mt-6"><Empty title="The good stuff is at the source.">This one's a link to the original author's site, with their ingredients and steps. We don't copy recipes without permission.</Empty></div>
        )}

        {recipe.equipment.length > 0 && <p className="mt-4 text-sm"><span className="font-bold">You'll need:</span> {recipe.equipment.join(', ')}</p>}
        <ThermomixNotice recipe={recipe} />

        {recipe.steps.length > 0 && (
          <section className="mt-6">
            <h2 className="display mb-2 text-2xl">Method</h2>
            <ol className="space-y-3">
              {recipe.steps.map((s, i) => (
                <li key={s.id} className="flex gap-3">
                  <span aria-hidden className="display flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-white">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p>{highlightStep(s.text, recipe.ingredients)}</p>
                    {s.timerSeconds.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{s.timerSeconds.map((t, k) => <Fragment key={k}><Tag tone="gum"><TimerIcon size={12} aria-hidden />{timerLabel(t)}</Tag></Fragment>)}</div>}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        {recipe.kidTasks.length > 0 && (
          <Card className="mt-6 bg-gum">
            <h2 className="display text-xl">Little helpers</h2>
            <ul className="mt-1 list-inside list-disc text-sm font-semibold">{recipe.kidTasks.map((k) => <li key={k}>{k}</li>)}</ul>
            <p className="mt-2 text-xs">Always with a grown-up. Kids shouldn't use hot equipment, sharp blades or the Thermomix alone.</p>
          </Card>
        )}

        <footer className="mt-6 rounded-2xl bg-white p-4 text-sm shadow-[var(--shadow-card)]">
          <p className="font-bold">Source: {recipe.source.name}{recipe.source.author && recipe.source.author !== recipe.source.name ? ` (${recipe.source.author.startsWith('http') ? 'original link' : recipe.source.author})` : ''}</p>
          <p className="text-xs text-muted">{recipe.source.license}{recipe.image ? `. ${recipe.image.credit}.` : ''}</p>
          {recipe.source.url && <a href={recipe.source.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 font-bold underline">View original <ExternalLink size={14} aria-hidden /></a>}
        </footer>
      </div>

      <AddToPlanSheet open={planOpen} onClose={() => setPlanOpen(false)} recipeId={recipe.id} servings={household.defaultServings} />
      <RateSheet open={rateOpen} onClose={() => setRateOpen(false)} recipeId={recipe.id} />
      <Sheet open={collectionsOpen} onClose={() => setCollectionsOpen(false)} title="Collections">
        {!collections.length && <p className="text-sm text-muted">No collections yet. Make some in the Cookbook tab.</p>}
        <div className="flex flex-wrap gap-2">
          {collections.map((c) => {
            const on = book?.collectionIds.includes(c.id) ?? false;
            return <Chip key={c.id} active={on} onClick={() => void patchCookbook(recipe.id, { saved: true, collectionIds: on ? book!.collectionIds.filter((x) => x !== c.id) : [...(book?.collectionIds ?? []), c.id] })}>{c.name}</Chip>;
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Chip active={book?.familyFavourite} onClick={() => void patchCookbook(recipe.id, { saved: true, familyFavourite: !book?.familyFavourite })}>Family favourite</Chip>
          <Chip active={book?.wantToTry} onClick={() => void patchCookbook(recipe.id, { wantToTry: !book?.wantToTry })}>Want to try</Chip>
        </div>
      </Sheet>
      {pickerLine && <ProductPicker open onClose={() => setPicker(null)} lineKey={pickerLine.key} canonicalId={pickerLine.canonicalId} name={pickerLine.name} ctx={ctx} list={data?.list ?? []} currentId={pickerLine.plan?.lines[0]?.productId} />}
    </article>
  );
}

export function RecipeScreen() {
  const { id } = useParams();
  const { recipe, loading } = useRecipe(id);
  if (loading) return <div><Skeleton className="h-72" /><Skeleton className="mt-4 h-96" /></div>;
  if (!recipe) return <Empty title="Can't find that recipe." action={<Link to="/"><Button>Back to Discover</Button></Link>}>It might have been removed from the catalogue.</Empty>;
  return <RecipeBody key={recipe.id} recipe={recipe} />;
}

import { ChefHat, Check, ChevronLeft, ChevronRight, List, Pause, Play, Plus, RotateCcw, Sun, TimerIcon, Trash2, TriangleAlert, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, Empty, IconButton, Progress, Sheet, Skeleton, useFeedback } from '../../components/ui';
import { scaleIngredient } from '../../domain/ingredients';
import type { Recipe, ThermomixSettings } from '../../domain/types';
import { db, patchCookbook, uid, type CookingSessionRow } from '../../state/db';
import { useRecipe, useWakeLock } from '../../state/hooks';
import { deductRecipe, undoLog } from '../pantry/pantryActions';
import { highlightStep, ingredientAmount, StarPicker, timerLabel } from '../recipe/RecipeScreen';

type Timer = CookingSessionRow['timers'][number];

const remainingOf = (t: Timer, now: number) => (t.endsAt != null ? Math.max(0, Math.round((t.endsAt - now) / 1000)) : t.remaining);
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function beep() {
  try {
    navigator.vibrate?.([300, 120, 300]);
    const Ctx = window.AudioContext;
    const ctx = new Ctx();
    [0, 0.3, 0.6].forEach((at) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.value = 0.15;
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + at);
      o.stop(ctx.currentTime + at + 0.18);
    });
  } catch { /* no audio available: the visual alert still shows */ }
}

function ThermomixPanel({ tm }: { tm: ThermomixSettings }) {
  return (
    <div className="mt-4 rounded-3xl bg-lime p-4" data-testid="tm-panel">
      <p className="mb-2 flex items-center gap-2 text-sm font-extrabold"><ChefHat size={16} aria-hidden /> Set on your Thermomix yourself</p>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div><p className="text-xs font-bold">Temp</p><p className="display text-2xl">{tm.tempC === 'varoma' ? 'Varoma' : tm.tempC != null ? `${tm.tempC}°` : '—'}</p></div>
        <div><p className="text-xs font-bold">Time</p><p className="display text-2xl">{tm.timeSec != null ? timerLabel(tm.timeSec) : '—'}</p></div>
        <div><p className="text-xs font-bold">Speed</p><p className="display text-2xl">{tm.speed ?? '—'}{tm.reverse ? ' ⟲' : ''}</p></div>
      </div>
      {tm.accessories.length > 0 && <p className="mt-2 text-sm font-semibold">With: {tm.accessories.join(', ')}</p>}
      {tm.mode && <p className="text-sm font-semibold">Mode: {tm.mode}</p>}
      <p className="mt-1 text-xs font-semibold">For: {tm.models.join(', ')}</p>
      {!tm.verified && <p className="mt-2 flex gap-1.5 text-xs font-bold"><TriangleAlert size={14} aria-hidden className="shrink-0" /> Unverified settings. Check against your machine and the original author.</p>}
    </div>
  );
}

function CookBody({ recipe }: { recipe: Recipe }) {
  const navigate = useNavigate();
  const { toast } = useFeedback();
  const awake = useWakeLock();
  const [session, setSession] = useState<CookingSessionRow | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [showIngredients, setShowIngredients] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [stars, setStars] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [deduct, setDeduct] = useState(true);
  const fired = useRef(new Set<string>());

  // First load restores the saved session, so leaving and coming back keeps her place.
  useEffect(() => {
    let live = true;
    void db.cooking.get(recipe.id).then((stored) => {
      if (live) setSession(stored ?? { recipeId: recipe.id, stepIndex: 0, done: [], servings: recipe.servings, timers: [], updatedAt: Date.now() });
    });
    return () => {
      live = false;
    };
  }, [recipe.id, recipe.servings]);

  const save = (next: CookingSessionRow) => {
    setSession(next);
    void db.cooking.put({ ...next, updatedAt: Date.now() });
  };

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    for (const t of session?.timers ?? []) {
      if (t.endsAt != null && remainingOf(t, now) === 0 && !fired.current.has(t.id)) {
        fired.current.add(t.id);
        beep();
        toast(`${t.label}: time's up!`);
      }
    }
  }, [now, session?.timers, toast]);

  const factor = (session?.servings ?? recipe.servings) / recipe.servings;
  const ingredients = useMemo(() => recipe.ingredients.map((i) => scaleIngredient(i, factor)), [recipe.ingredients, factor]);
  if (!session) return <Skeleton className="m-4 h-96" />;

  const step = recipe.steps[session.stepIndex];
  const last = session.stepIndex === recipe.steps.length - 1;
  const isDone = session.done.includes(session.stepIndex);
  const go = (n: number) => save({ ...session, stepIndex: Math.max(0, Math.min(recipe.steps.length - 1, n)) });
  const addTimer = (seconds: number, label: string) => {
    fired.current.delete(label);
    save({ ...session, timers: [...session.timers, { id: uid(), label, total: seconds, remaining: seconds, endsAt: Date.now() + seconds * 1000 }] });
  };
  const patchTimer = (id: string, p: Partial<Timer>) => save({ ...session, timers: session.timers.map((t) => (t.id === id ? { ...t, ...p } : t)) });

  const finish = async () => {
    await db.ratings.put({ id: uid(), recipeId: recipe.id, stars, note: note.trim(), at: Date.now() });
    const row = await db.cookbook.get(recipe.id);
    await patchCookbook(recipe.id, { lastCookedAt: Date.now(), cookCount: (row?.cookCount ?? 0) + 1, saved: true, wantToTry: false });
    await db.meals.where('recipeId').equals(recipe.id).filter((m) => !m.cooked).modify({ cooked: true });
    await db.cooking.delete(recipe.id);
    const logs = deduct ? await deductRecipe(recipe, session.servings) : [];
    if (logs.length) toast(`Took ${logs.length} things from the pantry.`, { label: 'Undo', run: () => void undoLog(logs) });
    else toast('Nice work, chef.');
    navigate(`/recipe/${recipe.id}`, { replace: true });
  };

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="safe-t sticky top-0 z-20 bg-ink px-4 pb-3 text-white">
        <div className="flex h-12 items-center gap-2">
          <IconButton icon={X} label="Leave cooking mode" variant="ghost" onClick={() => navigate(`/recipe/${recipe.id}`)} />
          <p className="min-w-0 flex-1 truncate text-center font-bold">{recipe.title}</p>
          <span className="flex h-11 w-11 items-center justify-center">{awake && <Sun size={20} className="text-lime" aria-label="Screen staying awake" />}</span>
        </div>
        <Progress label="Cooking progress" value={session.done.length / recipe.steps.length} tone="lime" />
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-40 pt-4">
        <p className="text-sm font-extrabold uppercase tracking-wide text-deep" data-testid="step-label">Step {session.stepIndex + 1} of {recipe.steps.length}</p>
        <p className="mt-2 text-[1.45rem] font-semibold leading-snug" data-testid="step-text">{highlightStep(step.text, recipe.ingredients)}</p>
        {step.thermomix && <ThermomixPanel tm={step.thermomix} />}

        <div className="mt-4 flex flex-wrap gap-2">
          {step.timerSeconds.map((s, i) => <Button key={i} variant="hot" size="sm" icon={TimerIcon} data-testid="start-timer" onClick={() => addTimer(s, `Step ${session.stepIndex + 1}`)}>Start {timerLabel(s)}</Button>)}
          <Button variant="ghost" size="sm" icon={Plus} onClick={() => addTimer(300, 'Timer')}>5 min timer</Button>
          <Button variant="ghost" size="sm" icon={List} onClick={() => setShowIngredients(true)}>Ingredients</Button>
        </div>

        {session.timers.length > 0 && (
          <section aria-label="Timers" className="mt-5 space-y-2">
            {session.timers.map((t) => {
              const left = remainingOf(t, now);
              const running = t.endsAt != null;
              return (
                <div key={t.id} data-testid="timer" className={`flex items-center gap-2 rounded-full p-1.5 pl-4 ${left === 0 ? 'bg-hot text-white' : 'bg-white shadow-[var(--shadow-card)]'}`}>
                  <span className="min-w-0 flex-1 truncate text-sm font-bold">{t.label}</span>
                  <span className="display text-2xl tabular-nums" role="timer">{left === 0 ? 'Done!' : clock(left)}</span>
                  {left > 0 && <IconButton icon={running ? Pause : Play} label={running ? `Pause ${t.label}` : `Resume ${t.label}`} variant="ink" size={44} onClick={() => patchTimer(t.id, running ? { endsAt: null, remaining: left } : { endsAt: Date.now() + left * 1000 })} />}
                  <IconButton icon={RotateCcw} label={`Restart ${t.label}`} variant="ghost" size={44} onClick={() => { fired.current.delete(t.id); patchTimer(t.id, { endsAt: Date.now() + t.total * 1000, remaining: t.total }); }} />
                  <IconButton icon={Trash2} label={`Remove ${t.label}`} variant="ghost" size={44} onClick={() => save({ ...session, timers: session.timers.filter((x) => x.id !== t.id) })} />
                </div>
              );
            })}
          </section>
        )}
      </main>

      <footer className="safe-b fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white px-4 pt-3">
        <div className="mx-auto flex max-w-2xl items-center gap-2">
          <IconButton icon={ChevronLeft} label="Previous step" variant="ghost" size={56} disabled={session.stepIndex === 0} onClick={() => go(session.stepIndex - 1)} />
          <Button size="lg" variant={isDone ? 'lime' : 'ink'} className="flex-1" icon={Check} data-testid="step-done" onClick={() => {
            const done = isDone ? session.done.filter((d) => d !== session.stepIndex) : [...session.done, session.stepIndex];
            save({ ...session, done, stepIndex: !isDone && !last ? session.stepIndex + 1 : session.stepIndex });
          }}>{isDone ? 'Done' : last ? 'Done' : 'Done, next'}</Button>
          {last ? <Button size="lg" variant="hot" data-testid="finish-cooking" onClick={() => setFinishing(true)}>Finish</Button> : <IconButton icon={ChevronRight} label="Next step" variant="ghost" size={56} onClick={() => go(session.stepIndex + 1)} />}
        </div>
      </footer>

      <Sheet open={showIngredients} onClose={() => setShowIngredients(false)} title="Ingredients">
        <ul>{ingredients.map((i) => <li key={i.id} className="border-b border-line py-2 last:border-0"><span className="font-extrabold text-deep">{ingredientAmount(i)}</span> {i.name}{i.prep ? `, ${i.prep}` : ''}</li>)}</ul>
      </Sheet>
      <Sheet open={finishing} onClose={() => setFinishing(false)} title="Dinner's up!" footer={<Button className="mb-1 w-full" data-testid="save-cooked" onClick={() => void finish()}>Save</Button>}>
        <StarPicker value={stars} onChange={setStars} />
        <textarea aria-label="Notes for next time" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Kids loved it. Double the sauce next time…" className="mt-3 w-full rounded-2xl border border-line p-3 text-base" />
        <label className="mt-3 flex items-center gap-3 text-sm font-bold"><input type="checkbox" className="h-6 w-6 accent-[#19171B]" checked={deduct} onChange={(e) => setDeduct(e.target.checked)} /> Take what I used out of the pantry (you can undo this)</label>
      </Sheet>
    </div>
  );
}

export default function CookScreen() {
  const { id } = useParams();
  const { recipe, loading } = useRecipe(id);
  if (loading) return <Skeleton className="m-4 h-96" />;
  if (!recipe || !recipe.steps.length) return <div className="p-4"><Empty title="No steps to cook from." action={<Link to={recipe ? `/recipe/${recipe.id}` : '/'}><Button>Back</Button></Link>}>This recipe's instructions live at the original source.</Empty></div>;
  return <CookBody recipe={recipe} />;
}

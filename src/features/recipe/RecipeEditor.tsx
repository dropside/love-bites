import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Field, inputClass, Skeleton, Stepper, useFeedback } from '../../components/ui';
import { parseIngredientLine } from '../../domain/ingredients';
import type { Recipe, ThermomixSettings } from '../../domain/types';
import { db, patchCookbook, uid } from '../../state/db';
import { extractTimers } from './recipeUtils';

interface StepDraft { text: string; tm: { temp: string; time: string; speed: string; reverse: boolean } | null; }

const toDraft = (r: Recipe | null): { title: string; description: string; servings: number; minutes: string; ingredients: string; steps: StepDraft[] } => ({
  title: r?.title ?? '',
  description: r?.description ?? '',
  servings: r?.servings ?? 4,
  minutes: r?.totalMinutes != null ? String(r.totalMinutes) : '',
  ingredients: r?.ingredients.map((i) => i.original).join('\n') ?? '',
  steps: r?.steps.map((s) => ({ text: s.text, tm: s.thermomix ? { temp: String(s.thermomix.tempC ?? ''), time: String(s.thermomix.timeSec ?? ''), speed: s.thermomix.speed ?? '', reverse: s.thermomix.reverse } : null })) ?? [{ text: '', tm: null }],
});

/** Personal recipes: Ren's own, or her copy of a catalogue recipe. The original is never changed. */
export default function RecipeEditor() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const { toast } = useFeedback();
  const [form, setForm] = useState<ReturnType<typeof toDraft> | null>(isNew ? toDraft(null) : null);
  const [original, setOriginal] = useState<Recipe | null>(null);

  useEffect(() => {
    if (isNew || !id) return;
    void db.userRecipes.get(id).then((r) => {
      setOriginal(r ?? null);
      setForm(toDraft(r ?? null));
    });
  }, [id, isNew]);

  if (!form) return <Skeleton className="h-96" />;
  const set = (p: Partial<typeof form>) => setForm({ ...form, ...p });

  const save = async () => {
    const rid = original?.id ?? `user-${uid()}`;
    const lines = form.ingredients.split('\n').map((l) => l.trim()).filter(Boolean);
    const ingredients = lines.map((line, i) => parseIngredientLine(`${rid}-i${i}`, line));
    const steps = form.steps.filter((s) => s.text.trim()).map((s, i) => {
      const thermomix: ThermomixSettings | undefined = s.tm && (s.tm.temp || s.tm.time || s.tm.speed)
        ? { tempC: s.tm.temp.toLowerCase() === 'varoma' ? 'varoma' : parseFloat(s.tm.temp) || null, timeSec: parseFloat(s.tm.time) || null, speed: s.tm.speed || null, reverse: s.tm.reverse, accessories: [], mode: null, models: ['generic'], verified: false }
        : undefined;
      return { id: `${rid}-s${i}`, text: s.text.trim(), timerSeconds: extractTimers(s.text), thermomix };
    });
    const minutes = parseInt(form.minutes, 10);
    const row: Recipe & { updatedAt: number } = {
      ...(original ?? {
        mealTypes: ['dinner', 'lunch'], cuisine: null, mainIngredient: null, tags: [], dietary: [], allergens: [], thermomix: 'none', image: null, equipment: [], kidTasks: [], issues: [], prepMinutes: null, cookMinutes: null,
        source: { name: 'My recipe', url: null, author: 'Ren', license: 'Your own recipe', licenseUrl: null, rights: 'user-owned', provenance: 'Entered in Love Bites', importedAt: new Date().toISOString() },
      }),
      id: rid, userOwned: true, title: form.title.trim(), description: form.description.trim() || null, servings: form.servings, servingsVerified: true,
      totalMinutes: Number.isFinite(minutes) ? minutes : null, timeEstimated: false, ingredients, steps,
      hasUnknownIngredients: ingredients.some((i) => !i.canonicalId), completeness: ingredients.length && steps.length ? 'complete' : 'needs-review', updatedAt: Date.now(),
    };
    await db.userRecipes.put(row);
    await patchCookbook(rid, { saved: true });
    toast('Saved to your cookbook.');
    navigate(`/recipe/${rid}`, { replace: true });
  };

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="display text-[2rem]">{isNew ? 'New recipe' : 'Edit my copy'}</h1>
      {original?.basedOn && <p className="text-sm text-muted">This is your personal copy. The original stays as it was.</p>}
      <Field label="Name"><input className={inputClass} value={form.title} onChange={(e) => set({ title: e.target.value })} /></Field>
      <Field label="Description"><input className={inputClass} value={form.description} onChange={(e) => set({ description: e.target.value })} /></Field>
      <div className="flex items-end justify-between gap-3">
        <div><span className="mb-1.5 block text-sm font-bold">Serves</span><Stepper label="recipe servings" value={form.servings} onChange={(servings) => set({ servings })} /></div>
        <Field label="Total minutes"><input inputMode="numeric" className={inputClass} value={form.minutes} onChange={(e) => set({ minutes: e.target.value })} /></Field>
      </div>
      <Field label="Ingredients, one per line" hint="Like: 500 g chicken thighs, or 2 cups rice">
        <textarea rows={8} className="w-full rounded-2xl border border-line p-3 text-base" value={form.ingredients} onChange={(e) => set({ ingredients: e.target.value })} />
      </Field>
      <section className="space-y-3">
        <h2 className="text-sm font-bold">Steps</h2>
        {form.steps.map((s, i) => (
          <div key={i} className="rounded-2xl bg-pale p-3">
            <textarea aria-label={`Step ${i + 1}`} rows={3} className="w-full rounded-2xl border border-line bg-white p-3 text-base" value={s.text} onChange={(e) => set({ steps: form.steps.map((x, k) => (k === i ? { ...x, text: e.target.value } : x)) })} />
            {s.tm ? (
              <div className="mt-2 grid grid-cols-3 gap-2">
                {([['temp', 'Temp °C'], ['time', 'Seconds'], ['speed', 'Speed']] as const).map(([k, label]) => (
                  <Field key={k} label={label}><input className={inputClass} value={s.tm![k]} onChange={(e) => set({ steps: form.steps.map((x, j) => (j === i ? { ...x, tm: { ...x.tm!, [k]: e.target.value } } : x)) })} /></Field>
                ))}
                <label className="col-span-3 flex items-center gap-2 text-sm font-bold"><input type="checkbox" className="h-5 w-5" checked={s.tm.reverse} onChange={(e) => set({ steps: form.steps.map((x, j) => (j === i ? { ...x, tm: { ...x.tm!, reverse: e.target.checked } } : x)) })} /> Reverse</label>
                <p className="col-span-3 text-xs text-muted">Shown as your own unverified note. Check against your machine's guidance.</p>
              </div>
            ) : (
              <button type="button" className="mt-1 text-sm font-bold underline" onClick={() => set({ steps: form.steps.map((x, j) => (j === i ? { ...x, tm: { temp: '', time: '', speed: '', reverse: false } } : x)) })}>Add Thermomix settings</button>
            )}
          </div>
        ))}
        <Button variant="ghost" size="sm" onClick={() => set({ steps: [...form.steps, { text: '', tm: null }] })}>Add a step</Button>
      </section>
      <div className="flex gap-2 pt-2">
        <Button variant="ghost" className="flex-1" onClick={() => navigate(-1)}>Cancel</Button>
        <Button className="flex-1" data-testid="save-recipe-edit" disabled={!form.title.trim()} onClick={() => void save()}>Save</Button>
      </div>
    </div>
  );
}

import { useLiveQuery } from 'dexie-react-hooks';
import { Download, Lock, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Logo } from '../../components/brand';
import { Button, Card, Chip, Field, inputClass, selectClass, Sheet, Stepper, Tag, useFeedback } from '../../components/ui';
import { loadReport } from '../../data/catalog';
import { CANONICAL_INGREDIENTS } from '../../domain/canonicalData';
import { formatMoney, priceStatus, PRICE_STATUS_LABEL } from '../../domain/pricing';
import type { Allergen } from '../../domain/types';
import { exportBackup, restoreBackup, validateBackup, type BackupSummary } from '../../state/backup';
import { db, patchCookbook, saveHousehold } from '../../state/db';
import { useHousehold } from '../../state/hooks';
import { lockApp } from '../gate/gate';
import { useManifest } from '../shop/useManifest';
import { parseImportText, toRecipe } from './importRecipes';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <h2 className="display mb-3 text-xl">{title}</h2>
      <div className="space-y-3">{children}</div>
    </Card>
  );
}

const ALLERGENS: Allergen[] = ['nuts', 'dairy', 'egg', 'gluten', 'fish', 'shellfish', 'soy', 'sesame', 'pork', 'alcohol'];
const DIETS = ['vegetarian', 'vegan', 'gluten-free', 'dairy-free', 'nut-free'];
const MEALS = ['dinner', 'lunch', 'breakfast', 'soup', 'salad', 'baking', 'dessert', 'snack'];

function IngredientListEditor({ label, ids, onChange }: { label: string; ids: string[]; onChange: (ids: string[]) => void }) {
  const [q, setQ] = useState('');
  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (t.length < 2) return [];
    return CANONICAL_INGREDIENTS.filter((c) => !c.free && !ids.includes(c.id) && c.name.toLowerCase().includes(t)).slice(0, 6);
  }, [q, ids]);
  return (
    <div>
      <p className="mb-1 text-sm font-bold">{label}</p>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {ids.map((id) => <button key={id} type="button" aria-label={`Remove ${id}`} onClick={() => onChange(ids.filter((x) => x !== id))}><Tag>{CANONICAL_INGREDIENTS.find((c) => c.id === id)?.name ?? id} ×</Tag></button>)}
        {!ids.length && <span className="text-sm text-muted">None</span>}
      </div>
      <input type="search" aria-label={`Add to ${label}`} placeholder="Search ingredients" value={q} onChange={(e) => setQ(e.target.value)} className={inputClass} />
      <div className="mt-2 flex flex-wrap gap-1.5">{matches.map((c) => <Chip key={c.id} onClick={() => { onChange([...ids, c.id]); setQ(''); }}>+ {c.name}</Chip>)}</div>
    </div>
  );
}

const money = (c: number | null) => (c == null ? '' : String(c / 100));
const toCents = (s: string) => {
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
};

export default function SettingsScreen({ onLock }: { onLock: () => void }) {
  const h = useHousehold();
  const { toast, confirm } = useFeedback();
  const manifest = useManifest();
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const [restore, setRestore] = useState<BackupSummary | null>(null);
  const backupInput = useRef<HTMLInputElement>(null);
  const recipeInput = useRef<HTMLInputElement>(null);
  const swipeCount = useLiveQuery(() => db.swipes.count(), []);
  const doneShops = useLiveQuery(() => db.sessions.where('status').equals('complete').count(), []);
  const userRecipes = useLiveQuery(() => db.userRecipes.count(), []);

  useEffect(() => {
    loadReport().then(setReport).catch(() => setReport(null));
  }, []);

  const r = report as null | { recipes: { totalDistinct: number; byCompleteness: Record<string, number>; bySource: Record<string, number>; pricedRecipes: number; thermomix: { nativeSourceLinkOnly: number; suitableUnverified: number; verifiedMachineSettings: number } }; woolworths: { uniqueProducts: number; matching: { lineMatchCoveragePct: number } } };
  const status = priceStatus(manifest?.products?.observedAt);
  const installed = typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone);
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const download = async () => {
    const data = await exportBackup();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = `love-bites-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    toast('Backup saved.');
  };
  const onBackupFile = async (file: File | undefined) => {
    if (!file) return;
    const res = validateBackup(await file.text());
    if (!res.ok) toast(res.error);
    else setRestore(res);
    if (backupInput.current) backupInput.current.value = '';
  };
  const onRecipeFile = async (file: File | undefined) => {
    if (!file) return;
    const { recipes, errors } = parseImportText(await file.text(), file.name);
    for (const x of recipes) {
      const row = toRecipe(x);
      await db.userRecipes.put(row);
      await patchCookbook(row.id, { saved: true });
    }
    toast(`Imported ${recipes.length} recipe${recipes.length === 1 ? '' : 's'}${errors.length ? `, ${errors.length} skipped` : ''}.`);
    if (recipeInput.current) recipeInput.current.value = '';
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="display text-[2rem]">Settings</h1>

      <Section title="Household">
        <div className="flex items-center justify-between"><span className="text-sm font-bold">Default servings</span><Stepper label="default servings" value={h.defaultServings} onChange={(defaultServings) => void saveHousehold({ defaultServings })} /></div>
        <div className="flex items-center justify-between"><span className="text-sm font-bold">Meals per week</span><Stepper label="meals per week" value={h.mealsPerWeek} max={14} onChange={(mealsPerWeek) => void saveHousehold({ mealsPerWeek })} /></div>
        <Field label="Longest cook time"><select className={selectClass} value={h.maxMinutes ?? ''} onChange={(e) => void saveHousehold({ maxMinutes: e.target.value ? +e.target.value : null })}><option value="">No limit</option>{[20, 30, 45, 60, 90].map((m) => <option key={m} value={m}>{m} minutes</option>)}</select></Field>
        <div><p className="mb-1 text-sm font-bold">Preferred meals</p><p className="mb-1 text-xs text-muted">Shows more of these in the feed and smart plans.</p><div className="flex flex-wrap gap-2">{MEALS.map((m) => <Chip key={m} className="capitalize" active={h.preferredMeals.includes(m)} onClick={() => void saveHousehold({ preferredMeals: toggle(h.preferredMeals, m) })}>{m}</Chip>)}</div></div>
        <label className="flex items-center gap-3 font-bold"><input type="checkbox" className="h-6 w-6 accent-[#19171B]" checked={h.showBreakfastSnacks} onChange={(e) => void saveHousehold({ showBreakfastSnacks: e.target.checked })} /> Show breakfast and snacks in the planner</label>
      </Section>

      <Section title="Dietary and allergies">
        <div><p className="mb-1 text-sm font-bold">Dietary requirements</p><div className="flex flex-wrap gap-2">{DIETS.map((d) => <Chip key={d} className="capitalize" active={h.dietary.includes(d)} onClick={() => void saveHousehold({ dietary: toggle(h.dietary, d) })}>{d}</Chip>)}</div></div>
        <div><p className="mb-1 text-sm font-bold">Allergies</p><div className="flex flex-wrap gap-2">{ALLERGENS.map((a) => <Chip key={a} className="capitalize" active={h.allergies.includes(a)} onClick={() => void saveHousehold({ allergies: toggle(h.allergies, a) })}>{a}</Chip>)}</div>
          <p className="mt-2 text-xs text-muted">Recipes with these, or with ingredients we can't identify, are left out of the feed and plans. Recipe data can be wrong, so always read product labels.</p></div>
        <IngredientListEditor label="Disliked ingredients" ids={h.dislikedIds} onChange={(dislikedIds) => void saveHousehold({ dislikedIds })} />
        <IngredientListEditor label="Always-at-home staples" ids={h.stapleIds} onChange={(stapleIds) => void saveHousehold({ stapleIds })} />
      </Section>

      <Section title="Budget">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Weekly meal budget ($)"><input key={`w${h.weeklyBudgetCents}`} inputMode="decimal" data-testid="budget-weekly" className={inputClass} defaultValue={money(h.weeklyBudgetCents)} onBlur={(e) => void saveHousehold({ weeklyBudgetCents: toCents(e.target.value) })} /></Field>
          <Field label="Dinner-only budget ($)"><input key={`d${h.dinnerBudgetCents}`} inputMode="decimal" className={inputClass} defaultValue={money(h.dinnerBudgetCents)} onBlur={(e) => void saveHousehold({ dinnerBudgetCents: toCents(e.target.value) })} /></Field>
          <Field label="Max per serving ($)" hint="Hides dearer recipes from the feed and smart plans."><input key={`s${h.maxPerServeCents}`} inputMode="decimal" className={inputClass} defaultValue={money(h.maxPerServeCents)} onBlur={(e) => void saveHousehold({ maxPerServeCents: toCents(e.target.value) })} /></Field>
        </div>
      </Section>

      <Section title="Woolworths">
        <Field label="Preferred store" hint="For your reference. Prices are generic online prices and aren't specific to this store.">
          <input key={h.store} className={inputClass} defaultValue={h.store} placeholder="e.g. Woolworths Ponsonby" onBlur={(e) => void saveHousehold({ store: e.target.value })} />
        </Field>
        <Field label="Preferred brands" hint="Comma separated. Chosen first when a suitable product exists, even if dearer. Your hand-picked products still win.">
          <input key={h.preferredBrands.join()} className={inputClass} defaultValue={h.preferredBrands.join(', ')} onBlur={(e) => void saveHousehold({ preferredBrands: e.target.value.split(',').map((b) => b.trim()).filter(Boolean) })} />
        </Field>
        <p className="flex flex-wrap items-center gap-2 text-sm"><Tag tone={status === 'current' ? 'lime' : 'warn'}>{PRICE_STATUS_LABEL[status]}</Tag>{manifest?.products && <>Updated {new Date(manifest.products.observedAt).toLocaleDateString('en-NZ')}</>}</p>
        {manifest?.products && <p className="text-xs text-muted">{manifest.products.source}. {manifest.products.storeContext}. Stock status is never claimed, and there's no cart integration: product links open on woolworths.co.nz.</p>}
        <div className="flex items-center justify-between text-sm"><span>Units and currency</span><span className="font-bold">Metric, NZD</span></div>
        <p className="text-sm">Shop mode category order: {h.categoryOrder.join(' → ')}</p>
      </Section>

      <Section title="Recipes">
        {r && (
          <dl className="grid grid-cols-2 gap-2 text-sm" data-testid="catalog-stats">
            {[
              ['Total recipes', r.recipes.totalDistinct],
              ['Full recipes', r.recipes.byCompleteness.complete ?? 0],
              ['Link only', r.recipes.byCompleteness['discovery-only'] ?? 0],
              ['Priced', r.recipes.pricedRecipes],
              ['Thermomix originals (link)', r.recipes.thermomix.nativeSourceLinkOnly],
              ['Verified machine settings', r.recipes.thermomix.verifiedMachineSettings],
              ['Woolworths products', r.woolworths.uniqueProducts.toLocaleString()],
              ['Ingredient match', `${r.woolworths.matching.lineMatchCoveragePct}%`],
            ].map(([k, v]) => <div key={k} className="rounded-2xl bg-pale p-3"><dt className="text-xs font-bold text-muted">{k}</dt><dd className="display text-xl">{v}</dd></div>)}
          </dl>
        )}
        <p className="text-sm text-muted">You've added {userRecipes ?? 0} of your own. Import recipes you own as JSON, schema.org JSON, or CSV (title, servings, minutes, ingredients, steps, source_url). They stay on this device.</p>
        <input ref={recipeInput} type="file" accept=".json,.csv,application/json,text/csv" aria-label="Import recipes file" className="hidden" data-testid="recipe-import" onChange={(e) => void onRecipeFile(e.target.files?.[0])} />
        <Button variant="white" icon={Upload} onClick={() => recipeInput.current?.click()}>Import recipes</Button>
      </Section>

      <Section title="Backup">
        <p className="text-sm text-muted">Everything personal lives in this browser on this device. It doesn't sync between phones and computers, so back up now and then, or to move to a new phone.</p>
        <div className="flex flex-wrap gap-2">
          <Button icon={Download} data-testid="export-backup" onClick={() => void download()}>Export backup</Button>
          <input ref={backupInput} type="file" accept=".json,application/json" aria-label="Restore backup file" className="hidden" data-testid="restore-input" onChange={(e) => void onBackupFile(e.target.files?.[0])} />
          <Button variant="white" icon={Upload} onClick={() => backupInput.current?.click()}>Restore backup</Button>
        </div>
      </Section>

      <Section title="Clean up">
        <p className="text-sm">{swipeCount ?? 0} swipes recorded, {doneShops ?? 0} finished shops.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" data-testid="reset-discovery" onClick={() => void confirm({ title: 'Reset discovery history?', body: 'Passed recipes come back into the feed and learned tastes reset. Your cookbook stays.', danger: true, confirmLabel: 'Reset' }).then(async (ok) => { if (ok) { await db.swipes.clear(); await db.settings.delete('lastSwipe'); toast('Fresh start.'); } })}>Reset discovery</Button>
          <Button variant="ghost" onClick={() => void confirm({ title: 'Clear finished shops?', body: "Past shopping history goes. Your active list stays.", danger: true, confirmLabel: 'Clear' }).then(async (ok) => { if (ok) { const ids = (await db.sessions.where('status').equals('complete').toArray()).map((s) => s.id); await db.sessions.bulkDelete(ids); for (const id of ids) { await db.shopLines.where('sessionId').equals(id).delete(); await db.manualItems.where('sessionId').equals(id).delete(); await db.shopExtras.where('sessionId').equals(id).delete(); } toast('Cleared.'); } })}>Clear finished shops</Button>
          <Button variant="ink" icon={Lock} data-testid="lock-app" onClick={() => { lockApp(); onLock(); }}>Lock app</Button>
        </div>
      </Section>

      <Section title="About Love Bites">
        <Logo variant="full" className="mx-auto w-48 text-center text-3xl" />
        <dl className="text-sm">
          <div className="flex justify-between py-1"><dt>Version</dt><dd className="font-bold">{__APP_VERSION__}</dd></div>
          <div className="flex justify-between py-1"><dt>Data built</dt><dd className="font-bold">{manifest ? new Date(manifest.generatedAt).toLocaleDateString('en-NZ') : '—'}</dd></div>
          <div className="flex justify-between py-1"><dt>Installed as an app</dt><dd className="font-bold" data-testid="installed">{installed ? 'Yes' : 'Not yet'}</dd></div>
          <div className="flex justify-between py-1"><dt>Budget set</dt><dd className="font-bold">{formatMoney(h.weeklyBudgetCents)}</dd></div>
        </dl>
        <p className="text-xs text-muted">Recipes: TheMealDB and Wikibooks Cookbook contributors (CC BY-SA 4.0), with Thermomix links to ThermoBliss and ThermoFun. Prices: neon-ninja/woolies public snapshot. Not affiliated with Woolworths, Vorwerk or Thermomix. The kitchen code is a convenience, not real security.</p>
      </Section>

      <Sheet open={Boolean(restore)} onClose={() => setRestore(null)} title="Restore backup">
        {restore && (
          <>
            <p className="text-sm">From {new Date(restore.backup.exportedAt).toLocaleString('en-NZ')}: {restore.counts.cookbook} cookbook entries, {restore.counts.swipes} swipes, {restore.counts.meals} meals, {restore.counts.pantry} pantry items.</p>
            <div className="mt-4 grid gap-2">
              <Button data-testid="restore-merge" onClick={() => void restoreBackup(restore.backup, 'merge').then(() => { setRestore(null); toast('Merged. Anything already here was kept.'); })}>Merge with this device</Button>
              <Button variant="danger" data-testid="restore-replace" onClick={() => void confirm({ title: 'Replace everything?', body: 'All personal data on this device is swapped for the backup.', danger: true, confirmLabel: 'Replace' }).then((ok) => { if (ok) void restoreBackup(restore.backup, 'replace').then(() => { setRestore(null); toast('Restored.'); }); })}>Replace this device's data</Button>
            </div>
          </>
        )}
      </Sheet>
    </div>
  );
}

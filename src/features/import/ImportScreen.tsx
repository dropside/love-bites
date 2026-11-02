import { useLiveQuery } from 'dexie-react-hooks';
import { ClipboardPaste, Clock, Link2, Upload } from 'lucide-react';
import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, Field, inputClass, useFeedback } from '../../components/ui';
import { db, patchCookbook } from '../../state/db';
import { fetchRecipeFromUrl, parsePastedRecipe, parseImportText, toRecipe, type ImportInput } from './importRecipes';

function Section({ title, icon: Icon, children }: { title: string; icon: typeof Link2; children: ReactNode }) {
  return (
    <Card>
      <h2 className="display mb-3 flex items-center gap-2 text-xl"><Icon size={20} aria-hidden /> {title}</h2>
      <div className="space-y-3">{children}</div>
    </Card>
  );
}

const textareaClass = 'w-full rounded-2xl border border-line bg-white p-3 text-base';

export default function ImportScreen() {
  const navigate = useNavigate();
  const { toast } = useFeedback();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pasted, setPasted] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const pasteRef = useRef<HTMLTextAreaElement>(null);
  const recent = useLiveQuery(() => db.userRecipes.toArray().then((rs) => rs.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5)), []);

  const save = async (input: ImportInput) => {
    const row = toRecipe(input);
    await db.userRecipes.put(row);
    await patchCookbook(row.id, { saved: true });
    toast('Imported and saved to your cookbook.');
    navigate(`/recipe/${row.id}`);
  };

  const onLink = async (e: FormEvent) => {
    e.preventDefault();
    let clean: string;
    try {
      clean = new URL(url.trim()).toString();
    } catch {
      toast("That doesn't look like a link. It should start with https://");
      return;
    }
    const existing = await db.userRecipes.filter((r) => r.source.url === clean).first();
    if (existing) {
      toast('Already imported. Opening it.');
      navigate(`/recipe/${existing.id}`);
      return;
    }
    setBusy(true);
    setFailed(false);
    try {
      await save(await fetchRecipeFromUrl(clean));
    } catch {
      setFailed(true);
      setTimeout(() => pasteRef.current?.focus(), 50);
    } finally {
      setBusy(false);
    }
  };

  const onPaste = async () => {
    let source: string | null = null;
    try {
      source = url.trim() ? new URL(url.trim()).toString() : null;
    } catch { /* no link, that's fine */ }
    const input = parsePastedRecipe(pasted, source);
    if (!input) {
      toast("Couldn't find an Ingredients and a Method heading in that text.");
      return;
    }
    await save(input);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const { recipes, errors } = parseImportText(await file.text(), file.name);
    for (const x of recipes) {
      const row = toRecipe(x);
      await db.userRecipes.put(row);
      await patchCookbook(row.id, { saved: true });
    }
    toast(`Imported ${recipes.length} recipe${recipes.length === 1 ? '' : 's'}${errors.length ? `, ${errors.length} skipped` : ''}.`);
    if (fileInput.current) fileInput.current.value = '';
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="display text-[2rem]">Import</h1>
        <p className="text-sm text-muted">Bring in a recipe from anywhere. Cups, ounces, pounds and °F are switched to metric, and it's saved to your cookbook on this device.</p>
      </div>

      <Section title="From a link" icon={Link2}>
        <form onSubmit={(e) => void onLink(e)} className="space-y-3">
          <Field label="Recipe link">
            <input type="url" inputMode="url" autoComplete="off" placeholder="https://www.example.com/best-lasagne" data-testid="import-url" className={inputClass} value={url} onChange={(e) => setUrl(e.target.value)} />
          </Field>
          <Button type="submit" className="w-full" data-testid="import-link" disabled={busy || !url.trim()}>{busy ? 'Reading the page…' : 'Import recipe'}</Button>
        </form>
        {failed && (
          <p role="alert" data-testid="import-failed" className="rounded-2xl bg-gum p-3 text-sm">
            That site wouldn't let us read the page. Open it, select and copy the recipe (title, ingredients and method), then paste it below.
          </p>
        )}
        <p className="text-xs text-muted">Most sites block apps from reading them directly, so links are read through the Jina reader service (r.jina.ai). Only the link is sent.</p>
      </Section>

      <Section title="Paste a recipe" icon={ClipboardPaste}>
        <Field label="Recipe text" hint='Needs an "Ingredients" heading and a "Method" (or "Instructions") heading. The link above is kept as the source if you entered one.'>
          <textarea ref={pasteRef} rows={8} data-testid="import-paste" className={textareaClass} value={pasted} onChange={(e) => setPasted(e.target.value)} />
        </Field>
        <Button variant="white" className="w-full" data-testid="import-paste-save" disabled={!pasted.trim()} onClick={() => void onPaste()}>Import pasted recipe</Button>
        <p className="text-sm">Or <Link to="/recipe/new/edit" className="font-bold underline">write one from scratch</Link>.</p>
      </Section>

      <Section title="From a file" icon={Upload}>
        <p className="text-sm text-muted">JSON, schema.org JSON, or CSV (title, servings, minutes, ingredients, steps, source_url).</p>
        <input ref={fileInput} type="file" accept=".json,.csv,application/json,text/csv" aria-label="Import recipes file" className="hidden" data-testid="recipe-import" onChange={(e) => void onFile(e.target.files?.[0])} />
        <Button variant="white" icon={Upload} onClick={() => fileInput.current?.click()}>Choose a file</Button>
      </Section>

      {Boolean(recent?.length) && (
        <Section title="Recently added" icon={Clock}>
          <ul className="space-y-1">
            {recent!.map((r) => <li key={r.id}><Link to={`/recipe/${r.id}`} className="font-bold underline">{r.title}</Link> <span className="text-xs text-muted">{r.source.name}</span></li>)}
          </ul>
        </Section>
      )}
    </div>
  );
}

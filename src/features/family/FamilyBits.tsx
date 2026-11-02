import { Heart, Trash2, Users } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RecipeImage } from '../../components/RecipeBits';
import { Button, Empty, IconButton, Sheet, Tag, useFeedback } from '../../components/ui';
import { cloudEnabled } from '../../cloud/client';
import { bringHome, shareRecipe, unshare, useFamily, type FamilyShare } from '../../cloud/family';
import type { Recipe, RecipeSummary } from '../../domain/types';

/** "Loved by Ren and Katie" on a recipe. */
export function LovedBy({ recipeId }: { recipeId: string }) {
  const { lovedBy } = useFamily();
  const names = lovedBy(recipeId);
  if (!names.length) return null;
  const list = names.length > 2 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names.join(' and ');
  return <span data-testid="loved-by"><Tag tone="gum" className="whitespace-normal"><Heart size={11} fill="currentColor" aria-hidden /> Loved by {list}</Tag></span>;
}

export function ShareWithFamilyButton({ recipe }: { recipe: Recipe }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const { toast } = useFeedback();
  if (!cloudEnabled()) return null;
  const send = async () => {
    setBusy(true);
    const ok = await shareRecipe(recipe, note);
    setBusy(false);
    if (ok) {
      setOpen(false);
      setNote('');
      toast('Shared with the family.');
    } else toast("Couldn't share. You need to be online.");
  };
  return (
    <>
      <Button variant="white" icon={Users} data-testid="share-family" onClick={() => setOpen(true)}>Share with family</Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Share with family" footer={<Button className="mb-1 w-full" data-testid="share-family-send" disabled={busy} onClick={() => void send()}>{busy ? 'Sharing…' : 'Share'}</Button>}>
        <p className="mb-2 text-sm">Everyone in the family sees {recipe.title} in their cookbook under From family.</p>
        <label htmlFor="share-note" className="mb-1 block text-sm font-bold">Add a note (optional)</label>
        <textarea id="share-note" rows={3} maxLength={280} placeholder="Made this last night, so good with extra garlic" className="w-full rounded-2xl border border-line p-3 text-base" value={note} onChange={(e) => setNote(e.target.value)} />
      </Sheet>
    </>
  );
}

const ago = (iso: string) => {
  const d = (Date.now() - new Date(iso).getTime()) / 86_400_000;
  return d < 1 ? 'today' : d < 2 ? 'yesterday' : d < 14 ? `${Math.floor(d)} days ago` : new Date(iso).toLocaleDateString('en-NZ');
};

/** The From family shelf: recipes people shared, then what others love. */
export function FamilyShelf({ byId }: { byId: Map<string, RecipeSummary> }) {
  const { shares, loves, me, nameOf, lovedBy } = useFamily();
  const navigate = useNavigate();
  const open = async (s: FamilyShare) => navigate(`/recipe/${await bringHome(s)}`);
  const favourites = Object.keys(loves)
    .filter((id) => lovedBy(id).length > 0 && byId.has(id))
    .sort((a, b) => lovedBy(b).length - lovedBy(a).length)
    .slice(0, 40);

  if (!shares.length && !favourites.length) {
    return <Empty title="Nothing from the family yet.">Open any recipe and tap Share with family. Recipes the family loves show up here too.</Empty>;
  }
  return (
    <div className="space-y-5">
      {shares.length > 0 && (
        <section>
          <h2 className="display mb-2 text-xl">Shared</h2>
          <ul className="grid gap-3 md:grid-cols-2">
            {shares.map((s) => (
              <li key={s.id} data-testid="family-share" className="flex gap-3 rounded-[1.5rem] bg-white p-3 shadow-[var(--shadow-card)]">
                <button type="button" className="flex min-w-0 flex-1 gap-3 text-left" onClick={() => void open(s)}>
                  <RecipeImage id={s.recipe_id} title={s.title} src={s.image ?? byId.get(s.recipe_id)?.image ?? null} className="h-20 w-20 shrink-0 rounded-2xl" />
                  <span className="min-w-0">
                    <span className="block font-extrabold leading-tight">{s.title}</span>
                    <span className="block text-xs text-muted">{nameOf(s.user_id)} · {ago(s.created_at)}</span>
                    {s.note && <span className="marker mt-1 line-clamp-2 block text-deep">“{s.note}”</span>}
                  </span>
                </button>
                {s.user_id === me && <IconButton icon={Trash2} label={`Stop sharing ${s.title}`} variant="ghost" size={40} onClick={() => void unshare(s.id)} />}
              </li>
            ))}
          </ul>
        </section>
      )}
      {favourites.length > 0 && (
        <section>
          <h2 className="display mb-2 text-xl">Family loves</h2>
          <ul className="grid gap-3 md:grid-cols-2">
            {favourites.map((id) => {
              const r = byId.get(id)!;
              return (
                <li key={id} data-testid="family-love">
                  <button type="button" className="flex w-full gap-3 rounded-[1.5rem] bg-white p-3 text-left shadow-[var(--shadow-card)]" onClick={() => navigate(`/recipe/${id}`)}>
                    <RecipeImage id={id} title={r.title} src={r.image} className="h-20 w-20 shrink-0 rounded-2xl" />
                    <span className="min-w-0">
                      <span className="block font-extrabold leading-tight">{r.title}</span>
                      <span className="mt-1 block"><LovedBy recipeId={id} /></span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

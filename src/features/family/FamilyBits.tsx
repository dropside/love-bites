import { Globe, Heart, Link2, Share2, Trash2, Users } from 'lucide-react';
import { publishRecipe, unpublishRecipe, useCommunityRecipes, useIsContributor } from '../../cloud/community';
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

/** One Share button: send it to the family with a note, or send a link anywhere. */
export function ShareButton({ recipe, onShareLink }: { recipe: Recipe; onShareLink: () => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const { toast } = useFeedback();
  if (!cloudEnabled()) return <Button variant="white" icon={Share2} onClick={onShareLink}>Share</Button>;
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
      <Button variant="white" icon={Share2} data-testid="share-family" onClick={() => setOpen(true)}>Share</Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Share">
        <p className="mb-2 text-sm">Send it to the family. It shows in their cookbook under From family.</p>
        <label htmlFor="share-note" className="mb-1 block text-sm font-bold">Add a note (optional)</label>
        <textarea id="share-note" rows={3} maxLength={280} placeholder="Made this last night, so good with extra garlic" className="w-full rounded-2xl border border-line p-3 text-base" value={note} onChange={(e) => setNote(e.target.value)} />
        <Button className="mt-3 w-full" icon={Users} data-testid="share-family-send" disabled={busy} onClick={() => void send()}>{busy ? 'Sharing…' : 'Share with family'}</Button>
        <Button variant="ghost" className="mt-2 w-full" icon={Link2} onClick={() => { setOpen(false); onShareLink(); }}>Send a link instead</Button>
      </Sheet>
    </>
  );
}

/** For contributors: put one of your own recipes into Love Bites for the whole family, or take it back out. */
export function PublishButton({ recipe }: { recipe: Recipe }) {
  const contributor = useIsContributor();
  const community = useCommunityRecipes();
  const { toast, confirm } = useFeedback();
  const navigate = useNavigate();
  const { me } = useFamily();
  if (!cloudEnabled() || !contributor) return null;
  const publishedId = `community-${recipe.id.replace(/^(user|community)-/, '')}`;
  const published = community.find((r) => r.id === publishedId);
  if (recipe.id.startsWith('community-')) {
    if (published?.user_id !== me) return null;
    return (
      <Button variant="white" icon={Globe} data-testid="unpublish" onClick={() => void confirm({ title: 'Take this out of Love Bites?', body: 'It disappears from everyone’s feed. Anyone who saved it keeps their plans, but it may stop opening for them.', danger: true, confirmLabel: 'Remove' }).then(async (ok) => {
        if (!ok) return;
        if (await unpublishRecipe(recipe.id)) {
          toast('Removed from Love Bites.');
          navigate('/');
        } else toast("Couldn't remove it. You need to be online.");
      })}>Remove from Love Bites</Button>
    );
  }
  if (!recipe.userOwned) return null;
  return (
    <Button variant="lime" icon={Globe} data-testid="publish" onClick={() => void confirm({ title: published ? 'Update it in Love Bites?' : 'Add to Love Bites for everyone?', body: 'Everyone in the family will see it in Discover. Only add recipes you’re happy to share.', confirmLabel: published ? 'Update' : 'Add it' }).then(async (ok) => {
      if (!ok) return;
      const id = await publishRecipe(recipe);
      toast(id ? 'Added to Love Bites. Everyone can find it now.' : "Couldn't add it. You need to be online.");
    })}>{published ? 'Update in Love Bites' : 'Add to Love Bites'}</Button>
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

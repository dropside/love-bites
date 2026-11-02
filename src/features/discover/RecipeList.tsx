import { Bookmark, Heart } from 'lucide-react';
import { useState } from 'react';
import { CompletenessTag, RecipeRow } from '../../components/RecipeBits';
import { Button, IconButton } from '../../components/ui';
import type { RecipeSummary } from '../../domain/types';

const PAGE = 30;

/** Browse the same ranked, filtered recipes as the cards, without having to decide on each one. */
export function RecipeList({ recipes, onSwipe }: { recipes: RecipeSummary[]; onSwipe: (r: RecipeSummary, a: 'love' | 'save') => void }) {
  const [shown, setShown] = useState(PAGE);
  return (
    <section aria-label="Recipe list">
      <ul className="grid gap-3 md:grid-cols-2">
        {recipes.slice(0, shown).map((r) => (
          <li key={r.id} data-testid="discover-row">
            <RecipeRow
              r={r}
              sub={<div className="mt-1 empty:hidden"><CompletenessTag r={r} /></div>}
              right={
                <div className="flex flex-col gap-1.5">
                  <IconButton icon={Heart} label={`Love ${r.title}`} variant="hot" size={44} onClick={() => onSwipe(r, 'love')} />
                  <IconButton icon={Bookmark} label={`Save ${r.title} for later`} variant="lime" size={44} onClick={() => onSwipe(r, 'save')} />
                </div>
              }
            />
          </li>
        ))}
      </ul>
      {shown < recipes.length && (
        <Button variant="white" className="mt-4 w-full" data-testid="show-more" onClick={() => setShown(shown + PAGE)}>
          Show more ({recipes.length - shown} left)
        </Button>
      )}
    </section>
  );
}

// Shared recipe visuals. Prices and completeness are shown honestly wherever a recipe appears.
import { Baby, ChefHat, Clock, ExternalLink, Users } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { RecipeSummary } from '../domain/types';
import { formatMoney } from '../domain/pricing';
import { hash01 } from '../domain/ranking';
import { cx, Tag } from './ui';

export function RecipeImage({ id, title, src, className, large }: { id: string; title: string; src: string | null; className?: string; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return <img src={src} alt="" loading="lazy" decoding="async" draggable={false} className={cx('object-cover', className)} onError={() => setFailed(true)} />;
  }
  const v = hash01(id, 3);
  return (
    <div aria-hidden className={cx('poster flex', large ? 'items-start' : 'items-center justify-center', v > 0.66 ? 'alt' : v > 0.33 ? 'alt2' : '', className)}>
      {large ? <span className="display relative z-10 line-clamp-3 px-5 pt-16 text-[2.6rem] leading-[1.02] text-ink">{title}</span> : <span className="display relative z-10 text-3xl text-ink">{title.trim()[0]}</span>}
    </div>
  );
}

export const minutesLabel = (r: Pick<RecipeSummary, 'totalMinutes' | 'timeEstimated'>) =>
  r.totalMinutes == null ? null : `${r.timeEstimated ? '~' : ''}${r.totalMinutes >= 90 ? `${+(r.totalMinutes / 60).toFixed(1)} hr` : `${r.totalMinutes} min`}`;

export const perServeCents = (r: Pick<RecipeSummary, 'valueCents' | 'servings'>) => (r.valueCents != null && r.servings ? Math.round(r.valueCents / r.servings) : null);

export function CompletenessTag({ r }: { r: Pick<RecipeSummary, 'completeness'> }) {
  if (r.completeness === 'discovery-only') return <Tag tone="warn"><ExternalLink size={12} aria-hidden /> Recipe at source</Tag>;
  if (r.completeness === 'needs-review') return <Tag tone="warn">Needs review</Tag>;
  if (r.completeness === 'ingredients-verified') return <Tag tone="warn">Steps at source</Tag>;
  return null;
}

export function ThermomixTag({ r }: { r: Pick<RecipeSummary, 'thermomix'> }) {
  if (r.thermomix === 'native-source') return <Tag tone="lime"><ChefHat size={12} aria-hidden /> Thermomix recipe</Tag>;
  if (r.thermomix === 'suitable-unverified') return <Tag tone="pale"><ChefHat size={12} aria-hidden /> TM-friendly, no settings</Tag>;
  return null;
}

export function RecipeMeta({ r }: { r: RecipeSummary }) {
  const mins = minutesLabel(r);
  const serve = perServeCents(r);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold">
      {mins && <span className="inline-flex items-center gap-1"><Clock size={14} aria-hidden />{mins}</span>}
      {r.completeness !== 'discovery-only' && <span className="inline-flex items-center gap-1"><Users size={14} aria-hidden />{r.servingsVerified ? '' : '~'}{r.servings}</span>}
      {serve != null && <span className="text-deep">~{formatMoney(serve)}/serve</span>}
      {r.tags.includes('kid-friendly') && <span className="inline-flex items-center gap-1"><Baby size={14} aria-hidden />Kids</span>}
    </div>
  );
}

export function RecipeRow({ r, right, sub }: { r: RecipeSummary; right?: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-[1.5rem] bg-white p-2.5 shadow-[var(--shadow-card)]">
      <Link to={`/recipe/${r.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <RecipeImage id={r.id} title={r.title} src={r.image} className="h-20 w-20 shrink-0 rounded-2xl" />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 font-bold leading-tight">{r.title}</p>
          <div className="mt-1"><RecipeMeta r={r} /></div>
          {sub}
        </div>
      </Link>
      {right}
    </div>
  );
}

import { Bookmark, Heart, RotateCcw, X } from 'lucide-react';
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { CompletenessTag, RecipeImage, RecipeMeta, ThermomixTag } from '../../components/RecipeBits';
import { IconButton, Tag } from '../../components/ui';
import { formatMoney } from '../../domain/pricing';
import type { RecipeSummary } from '../../domain/types';

const THRESHOLD = 110;
const VELOCITY = 650;

export interface DeckCardInfo { recipe: RecipeSummary; availability: number; }

function CardFace({ info, large }: { info: DeckCardInfo; large?: boolean }) {
  const r = info.recipe;
  return (
    <>
      <RecipeImage id={r.id} title={r.title} src={r.image} large className="absolute inset-0 h-full w-full" />
      <div className="absolute left-3 top-3 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-1.5">
        <CompletenessTag r={r} />
        <ThermomixTag r={r} />
        {r.specials > 0 && <Tag tone="ink">{r.specials} on special</Tag>}
      </div>
      <div className="absolute inset-x-2 bottom-2 rounded-[1.4rem] bg-white p-3.5">
        <h2 className={`display leading-[1.05] ${large ? 'line-clamp-2 text-[1.6rem]' : 'text-xl'}`} data-testid="card-title">{r.title}</h2>
        {r.description && <p className="mt-1 line-clamp-1 text-sm text-muted">{r.description}</p>}
        <div className="mt-2"><RecipeMeta r={r} /></div>
        <div className="mt-2 flex gap-1.5 overflow-hidden">
          {r.valueCents != null && <Tag tone="gum">~{formatMoney(r.valueCents)} used</Tag>}
          {r.completeness !== 'discovery-only' && <Tag tone="lime">{Math.round(info.availability * 100)}% findable</Tag>}
          {r.cuisine && <Tag>{r.cuisine}</Tag>}
          {r.dietary.includes('vegetarian') && <Tag>Vegetarian</Tag>}
        </div>
      </div>
    </>
  );
}

export function SwipeDeck({ cards, onSwipe, onUndo, canUndo }: { cards: DeckCardInfo[]; onSwipe: (r: RecipeSummary, a: 'love' | 'pass' | 'save') => void; onUndo: () => void; canUndo: boolean }) {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-300, 300], [-14, 14]);
  const loveOpacity = useTransform(x, [30, THRESHOLD], [0, 1]);
  const passOpacity = useTransform(x, [-THRESHOLD, -30], [1, 0]);
  const nextScale = useTransform(x, [-THRESHOLD, 0, THRESHOLD], [1, 0.95, 1]);
  const flying = useRef(false);
  const dragged = useRef(false);
  const top = cards[0];

  useEffect(() => {
    x.set(0);
    y.set(0);
    flying.current = false;
  }, [top?.recipe.id, x, y]);

  const fly = (action: 'love' | 'pass' | 'save') => {
    if (!top || flying.current) return;
    flying.current = true;
    if (reduced) {
      onSwipe(top.recipe, action);
      return;
    }
    const dx = action === 'love' ? 520 : action === 'pass' ? -520 : 0;
    const dy = action === 'save' ? -640 : 40;
    void animate(y, dy, { duration: 0.24, ease: 'easeIn' });
    void animate(x, dx, { duration: 0.24, ease: 'easeIn', onComplete: () => onSwipe(top.recipe, action) });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || document.querySelector('[role="dialog"]')) return;
      if (e.key === 'ArrowRight') fly('love');
      else if (e.key === 'ArrowLeft') fly('pass');
      else if (e.key === 'ArrowUp') { e.preventDefault(); fly('save'); }
      else if (e.key.toLowerCase() === 'u') onUndo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const second = cards[1];
  return (
    <section aria-label="Recipe recommendations">
      <div className="relative mx-auto h-[max(320px,calc(100dvh-420px))] max-h-[560px] w-full max-w-md select-none">
        {second && (
          <motion.div aria-hidden style={{ scale: nextScale }} className="absolute inset-0 overflow-hidden rounded-[2rem] bg-white shadow-[var(--shadow-card)]" key={second.recipe.id}>
            <CardFace info={second} />
          </motion.div>
        )}
        {top && (
          <motion.div
            key={top.recipe.id}
            data-testid="swipe-card"
            drag="x"
            dragSnapToOrigin
            dragElastic={0.9}
            dragMomentum={false}
            style={{ x, y, rotate, touchAction: 'pan-y' }}
            onDragStart={() => { dragged.current = true; }}
            onDragEnd={(_, info) => {
              if (info.offset.x > THRESHOLD || info.velocity.x > VELOCITY) fly('love');
              else if (info.offset.x < -THRESHOLD || info.velocity.x < -VELOCITY) fly('pass');
              setTimeout(() => { dragged.current = false; }, 50);
            }}
            onClick={() => { if (!dragged.current) navigate(`/recipe/${top.recipe.id}`); }}
            className="absolute inset-0 cursor-grab overflow-hidden rounded-[2rem] bg-white shadow-[var(--shadow-pop)] active:cursor-grabbing"
          >
            <CardFace info={top} large />
            <motion.span style={{ opacity: loveOpacity }} className="marker pointer-events-none absolute left-5 top-14 -rotate-12 rounded-xl border-4 border-hot bg-white/90 px-3 py-1 text-4xl text-hot">LOVE IT</motion.span>
            <motion.span style={{ opacity: passOpacity }} className="marker pointer-events-none absolute right-5 top-14 rotate-12 rounded-xl border-4 border-ink bg-white/90 px-3 py-1 text-4xl text-ink">NAH</motion.span>
          </motion.div>
        )}
      </div>
      <div className="mt-4 flex items-center justify-center gap-3">
        <IconButton icon={RotateCcw} label="Undo last swipe" size={52} disabled={!canUndo} onClick={onUndo} />
        <IconButton icon={X} label="Pass" variant="ink" size={68} disabled={!top} onClick={() => fly('pass')} />
        <IconButton icon={Bookmark} label="Save for later" variant="lime" size={52} disabled={!top} onClick={() => fly('save')} />
        <IconButton icon={Heart} label="Love it" variant="hot" size={68} disabled={!top} onClick={() => fly('love')} />
      </div>
      <p className="mt-2 hidden text-center text-xs text-muted md:block">Swipe, tap the buttons, or use ← → ↑ and U. Tap a card for the full recipe.</p>
    </section>
  );
}

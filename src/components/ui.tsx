// The Love Bites design system: small reusable pieces shared by every screen.
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'motion/react';
import { Check, Minus, Plus, X, type LucideIcon } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
export { cx };

type Variant = 'ink' | 'hot' | 'lime' | 'white' | 'ghost' | 'danger';
const VARIANTS: Record<Variant, string> = {
  ink: 'bg-ink text-white',
  hot: 'bg-pop text-ink',
  lime: 'bg-lime text-ink',
  white: 'bg-white text-ink border border-line',
  ghost: 'bg-pale text-ink',
  danger: 'bg-danger text-white',
};

export function Button({ variant = 'ink', size = 'md', icon: Icon, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; icon?: LucideIcon }) {
  const sz = size === 'sm' ? 'h-10 px-4 text-sm' : size === 'lg' ? 'h-14 px-6 text-base' : 'h-12 px-5 text-[15px]';
  return (
    <button type="button" className={cx('inline-flex items-center justify-center gap-2 rounded-full font-bold transition active:scale-[.97] disabled:opacity-40 disabled:pointer-events-none', VARIANTS[variant], sz, className)} {...rest}>
      {Icon && <Icon size={size === 'sm' ? 16 : 18} aria-hidden />}
      {children}
    </button>
  );
}

export function IconButton({ icon: Icon, label, variant = 'white', size = 44, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string; variant?: Variant; size?: number }) {
  return (
    <button type="button" aria-label={label} title={label} style={{ width: size, height: size }} className={cx('inline-flex shrink-0 items-center justify-center rounded-full transition active:scale-95 disabled:opacity-40', VARIANTS[variant], className)} {...rest}>
      <Icon size={Math.round(size * 0.45)} aria-hidden />
    </button>
  );
}

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('rounded-[var(--radius-card)] p-4 shadow-[var(--shadow-card)]', !/\bbg-/.test(className ?? '') && 'bg-white', className)} {...rest}>{children}</div>;
}

export function Chip({ active, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button type="button" aria-pressed={active} className={cx('inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition', active ? 'bg-ink text-white' : 'border border-line bg-white text-ink', className)} {...rest}>
      {children}
    </button>
  );
}

export function Tag({ tone = 'pale', children, className }: { tone?: 'pale' | 'lime' | 'ink' | 'gum' | 'warn' | 'white'; children: ReactNode; className?: string }) {
  const tones = { pale: 'bg-pale text-deep', lime: 'bg-lime text-ink', ink: 'bg-ink text-white', gum: 'bg-gum text-ink', warn: 'bg-[#FFE3C2] text-[#7A3B00]', white: 'bg-white/95 text-ink' };
  return <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold', tones[tone], className)}>{children}</span>;
}

export function SegmentedControl<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; count?: number }[]; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex gap-1 overflow-x-auto rounded-full bg-pale p-1 no-scrollbar">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)} className={cx('h-10 shrink-0 rounded-full px-4 text-sm font-bold transition', o.value === value ? 'bg-ink text-white' : 'text-ink')}>
          {o.label}{o.count != null && <span className="ml-1 opacity-70">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Stepper({ value, onChange, min = 1, max = 99, step = 1, label, format }: { value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number; label: string; format?: (n: number) => string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex items-center gap-1 rounded-full bg-pale p-1">
      <IconButton icon={Minus} label={`Less ${label}`} size={40} disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))} />
      <span aria-live="polite" data-testid={`stepper-${label}`} className="min-w-10 text-center font-bold tabular-nums">{format ? format(value) : value}</span>
      <IconButton icon={Plus} label={`More ${label}`} size={40} disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))} />
    </div>
  );
}

export function Checkbox({ checked, onChange, label, big }: { checked: boolean; onChange: (b: boolean) => void; label: string; big?: boolean }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={cx('inline-flex shrink-0 items-center justify-center rounded-full border-2 transition', big ? 'h-12 w-12' : 'h-8 w-8', checked ? 'border-ink bg-ink text-lime' : 'border-ink/40 bg-white')}>
      {checked && <Check size={big ? 26 : 18} strokeWidth={3} aria-hidden />}
    </button>
  );
}

export function Progress({ value, label, tone = 'hot' }: { value: number; label: string; tone?: 'hot' | 'lime' }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="h-3 w-full overflow-hidden rounded-full bg-pale">
      <div className={cx('h-full rounded-full transition-[width] duration-300', tone === 'hot' ? 'bg-hot' : 'bg-lime')} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-[var(--radius-card)] bg-pale px-6 py-10 text-center">
      <p className="display text-2xl">{title}</p>
      {children && <p className="mt-2 max-w-xs text-sm text-muted">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export const Skeleton = ({ className }: { className?: string }) => <div aria-hidden className={cx('skeleton rounded-3xl', className)} />;

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-[var(--radius-card)] bg-[#FFE3E8] p-5 text-center">
      <p className="font-bold text-danger">That didn't work.</p>
      <p className="mt-1 text-sm">{message}</p>
      {onRetry && <Button size="sm" className="mt-3" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

/** Modal bottom sheet with focus handling and Escape to close. */
export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const id = useId();
  const reduced = useReducedMotion();
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);
  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    panel.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      (opener.current as HTMLElement | null)?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <motion.div className="absolute inset-0 bg-ink/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={id}
            tabIndex={-1}
            initial={reduced ? { opacity: 0 } : { y: '100%' }}
            animate={reduced ? { opacity: 1 } : { y: 0 }}
            exit={reduced ? { opacity: 0 } : { y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 340 }}
            className="relative flex max-h-[88dvh] w-full max-w-lg flex-col rounded-t-[2rem] bg-white outline-none sm:rounded-[2rem]"
          >
            <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
              <h2 id={id} className="display text-2xl">{title}</h2>
              <IconButton icon={X} label="Close" variant="ghost" size={44} onClick={onClose} />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
            {footer && <div className="safe-b border-t border-line px-5 pt-3">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// ---- Confirm dialog + toast
interface ToastAction { label: string; run: () => void; }
interface ToastItem { id: number; text: string; actions: ToastAction[]; }
interface ConfirmOptions { title: string; body?: string; confirmLabel?: string; danger?: boolean; }
interface FeedbackApi {
  /** Up to two buttons, e.g. Undo and See list. */
  toast: (text: string, ...actions: (ToastAction | undefined)[]) => void;
  confirm: (o: ConfirmOptions) => Promise<boolean>;
}
const FeedbackContext = createContext<FeedbackApi | null>(null);
export const useFeedback = () => {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('FeedbackProvider missing');
  return ctx;
};

/** A toast that's on its way out can't be tapped, so Undo never reverses the wrong thing. */
function ToastView({ t, onDone }: { t: ToastItem; onDone: () => void }) {
  const present = useIsPresent();
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} aria-hidden={!present || undefined} className={cx('flex max-w-sm items-center gap-3 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white shadow-[var(--shadow-pop)]', t.actions.length > 0 && present && 'pointer-events-auto')}>
      <span>{t.text}</span>
      {t.actions.map((a) => (
        <button key={a.label} type="button" disabled={!present} className="shrink-0 font-extrabold text-lime underline" onClick={() => { a.run(); onDone(); }}>
          {a.label}
        </button>
      ))}
    </motion.div>
  );
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [dialog, setDialog] = useState<(ConfirmOptions & { resolve: (b: boolean) => void }) | null>(null);
  const next = useRef(1);
  const toast = useCallback<FeedbackApi['toast']>((text, ...maybe) => {
    const id = next.current++;
    const actions = maybe.filter((a): a is ToastAction => Boolean(a));
    setToasts([{ id, text, actions }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), actions.length ? 7000 : 3000);
  }, []);
  const confirm = useCallback<FeedbackApi['confirm']>((o) => new Promise((resolve) => setDialog({ ...o, resolve })), []);
  const api = useMemo(() => ({ toast, confirm }), [toast, confirm]);
  const close = (b: boolean) => {
    dialog?.resolve(b);
    setDialog(null);
  };
  return (
    <FeedbackContext.Provider value={api}>
      {children}
      <div aria-live="polite" className={cx('pointer-events-none fixed inset-x-0 z-[60] flex flex-col items-center gap-2 px-4', toasts[0]?.actions.length ? 'bottom-24' : 'top-16')}>
        <AnimatePresence>
          {toasts.map((t) => (
            <ToastView key={t.id} t={t} onDone={() => setToasts((x) => x.filter((y) => y.id !== t.id))} />
          ))}
        </AnimatePresence>
      </div>
      <Sheet open={Boolean(dialog)} onClose={() => close(false)} title={dialog?.title ?? ''}>
        {dialog?.body && <p className="text-muted">{dialog.body}</p>}
        <div className="mt-5 flex gap-3">
          <Button variant="ghost" className="flex-1" onClick={() => close(false)}>Never mind</Button>
          <Button variant={dialog?.danger ? 'danger' : 'ink'} className="flex-1" data-testid="confirm-yes" onClick={() => close(true)}>{dialog?.confirmLabel ?? 'Yes'}</Button>
        </div>
      </Sheet>
    </FeedbackContext.Provider>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-bold">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const inputClass = 'h-12 w-full rounded-2xl border border-line bg-white px-4 text-base outline-none focus:border-ink';
export const selectClass = inputClass;

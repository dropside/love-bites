// Logo + launch splash. Full sticker for big moments; the small black wordmark everywhere else.
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';

const LOGOS = { full: `${import.meta.env.BASE_URL}images/LB_full.svg`, small: `${import.meta.env.BASE_URL}images/LB_small.svg` };

export function Logo({ variant = 'small', className = '', eager }: { variant?: 'full' | 'small'; className?: string; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span role="img" aria-label="Love Bites" className={`display inline-block leading-none text-ink ${className}`}>
        Love<span className="text-hot">Bites</span>
      </span>
    );
  }
  return <img src={LOGOS[variant]} alt="Love Bites" loading={eager ? 'eager' : 'lazy'} decoding="async" draggable={false} className={className} onError={() => setFailed(true)} />;
}

const SPLASH_KEY = 'lb-splash-seen';

/** Pops in, shrinks away, fades to the app. Once per launch. */
export function Splash({ onDone }: { onDone: () => void }) {
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<'in' | 'out'>('in');
  useEffect(() => {
    const out = setTimeout(() => setPhase('out'), reduced ? 500 : 1150);
    const done = setTimeout(onDone, reduced ? 800 : 1650);
    return () => {
      clearTimeout(out);
      clearTimeout(done);
    };
  }, [onDone, reduced]);
  return (
    <motion.div
      data-testid="splash"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-pop px-6"
      animate={{ opacity: phase === 'out' ? 0 : 1 }}
      transition={{ duration: reduced ? 0.2 : 0.45, ease: 'easeIn', delay: phase === 'out' && !reduced ? 0.08 : 0 }}
    >
      <motion.div
        className="w-full max-w-md"
        initial={reduced ? { scale: 1 } : { scale: 0.2, rotate: -8, opacity: 0 }}
        animate={phase === 'in' ? { scale: 1, rotate: 0, opacity: 1 } : { scale: reduced ? 1 : 0.12, rotate: reduced ? 0 : 4, opacity: reduced ? 1 : 0 }}
        transition={phase === 'in' ? { type: 'spring', stiffness: 300, damping: 13, mass: 0.9 } : { duration: 0.42, ease: [0.6, -0.2, 0.8, 0.4] }}
      >
        <Logo variant="full" eager className="mx-auto block w-full text-center text-6xl" />
      </motion.div>
    </motion.div>
  );
}

export function useSplash() {
  const [show, setShow] = useState(() => {
    try {
      return !sessionStorage.getItem(SPLASH_KEY);
    } catch {
      return true;
    }
  });
  const done = () => {
    try {
      sessionStorage.setItem(SPLASH_KEY, '1');
    } catch {
      /* private mode: replays next launch, harmless */
    }
    setShow(false);
  };
  return { show, done };
}

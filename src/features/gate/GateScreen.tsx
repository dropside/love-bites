import { Eye, EyeOff, KeyRound } from 'lucide-react';
import { motion, useAnimationControls, useReducedMotion } from 'motion/react';
import { useState, type FormEvent } from 'react';
import { Logo } from '../../components/brand';
import { Button, cx } from '../../components/ui';
import { rememberUnlock, verifyCode } from './gate';

export function GateScreen({ onUnlock }: { onUnlock: () => void }) {
  const [code, setCode] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const controls = useAnimationControls();
  const reduced = useReducedMotion();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ok = await verifyCode(code);
    setBusy(false);
    if (ok) {
      rememberUnlock();
      onUnlock();
      return;
    }
    setError("Nope. That's not the kitchen code, babe.");
    if (!reduced) void controls.start({ x: [0, -10, 10, -6, 6, 0], transition: { duration: 0.35 } });
  };

  return (
    <main className="safe-t safe-b flex min-h-dvh flex-col items-center justify-center bg-pop px-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
        <Logo variant="full" eager className="mx-auto mb-4 block w-full text-center text-5xl" />
        <div className="rounded-[2rem] bg-white p-6 shadow-[var(--shadow-pop)]">
          <h1 className="display text-3xl leading-tight">Hey, gorgeous.<br />What's cooking?</h1>
          <motion.form animate={controls} onSubmit={submit} className="mt-5">
            <label htmlFor="kitchen-code" className="mb-1.5 block text-sm font-bold">Kitchen code</label>
            <div className={cx('flex h-14 items-center rounded-full border-2 bg-white pl-5 pr-1.5 focus-within:ring-2 focus-within:ring-pop', error ? 'border-danger' : 'border-ink')}>
              <KeyRound size={18} aria-hidden className="mr-2 shrink-0" />
              <input
                id="kitchen-code"
                autoFocus
                autoComplete="current-password"
                type={show ? 'text' : 'password'}
                value={code}
                onChange={(e) => { setCode(e.target.value); setError(''); }}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'code-error' : undefined}
                className="min-w-0 flex-1 bg-transparent text-base outline-none"
              />
              <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Hide code' : 'Show code'} className="flex h-11 w-11 items-center justify-center rounded-full">
                {show ? <EyeOff size={20} aria-hidden /> : <Eye size={20} aria-hidden />}
              </button>
            </div>
            {error && <p id="code-error" role="alert" className="mt-2 text-sm font-bold text-danger">{error}</p>}
            <Button type="submit" size="lg" className="mt-4 w-full" disabled={busy || !code.trim()}>Let me in</Button>
          </motion.form>
          <p className="mt-4 text-center text-xs text-muted">A friendly family gate, not real security. Your stuff stays on this device.</p>
        </div>
      </motion.div>
    </main>
  );
}

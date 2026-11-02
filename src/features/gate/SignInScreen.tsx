import { Eye, EyeOff } from 'lucide-react';
import { motion } from 'motion/react';
import { useState, type FormEvent } from 'react';
import { Logo } from '../../components/brand';
import { Button } from '../../components/ui';
import { cloud, rememberMember } from '../../cloud/client';
import { myDisplayName, saveDisplayName } from '../../cloud/family';

const field = 'h-14 w-full rounded-full border-2 border-ink bg-white px-5 text-base outline-none focus:ring-2 focus:ring-pop';

/** Invite-only sign in. Louie adds each person in Supabase; there's no way to sign up from the app. */
export function SignInScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const [step, setStep] = useState<'signin' | 'name'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const c = cloud()!;

  const signIn = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { data, error: err } = await c.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (err || !data.user) {
      setBusy(false);
      setError(err && /fetch|network/i.test(err.message) ? "Can't reach the kitchen. Check you're online and try again." : "That email and password don't match. Ask Louie if you're stuck.");
      return;
    }
    rememberMember({ id: data.user.id, email: data.user.email ?? email });
    const existing = await myDisplayName().catch(() => null);
    setBusy(false);
    if (existing) onSignedIn();
    else setStep('name');
  };

  const saveName = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ok = await saveDisplayName(name);
    setBusy(false);
    if (ok) onSignedIn();
    else setError("Couldn't save that. Try again.");
  };

  return (
    <main className="safe-t safe-b flex min-h-dvh flex-col items-center justify-center bg-pop px-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
        <Logo variant="full" eager className="mx-auto mb-4 block w-full text-center text-5xl" />
        <div className="rounded-[2rem] bg-white p-6 shadow-[var(--shadow-pop)]">
          {step === 'signin' && (
            <form onSubmit={(e) => void signIn(e)}>
              <h1 className="display text-3xl leading-tight">Hey, gorgeous.<br />What's cooking?</h1>
              <label htmlFor="email" className="mb-1.5 mt-5 block text-sm font-bold">Email</label>
              <input id="email" type="email" inputMode="email" autoComplete="username" autoFocus required value={email} onChange={(e) => { setEmail(e.target.value); setError(''); }} className={field} />
              <label htmlFor="password" className="mb-1.5 mt-3 block text-sm font-bold">Password</label>
              <div className="relative">
                <input id="password" type={show ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }} className={`${field} pr-14`} />
                <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-1.5 top-1.5 flex h-11 w-11 items-center justify-center rounded-full">
                  {show ? <EyeOff size={20} aria-hidden /> : <Eye size={20} aria-hidden />}
                </button>
              </div>
              <Button type="submit" size="lg" className="mt-4 w-full" disabled={busy || !email.includes('@') || !password}>{busy ? 'Checking…' : 'Let me in'}</Button>
            </form>
          )}
          {step === 'name' && (
            <form onSubmit={(e) => void saveName(e)}>
              <h1 className="display text-3xl leading-tight">What should the family call you?</h1>
              <label htmlFor="name" className="mb-1.5 mt-4 block text-sm font-bold">Your name</label>
              <input id="name" autoComplete="given-name" autoFocus maxLength={40} value={name} onChange={(e) => setName(e.target.value)} className={field} />
              <Button type="submit" size="lg" className="mt-4 w-full" disabled={busy || !name.trim()}>Done</Button>
            </form>
          )}
          {error && <p role="alert" className="mt-3 text-sm font-bold text-danger">{error}</p>}
          <p className="mt-4 text-center text-xs text-muted">Family only. Your cookbook, plans and pantry are backed up to your account and stay private. Shared recipes and loves are seen by the family.</p>
        </div>
      </motion.div>
    </main>
  );
}

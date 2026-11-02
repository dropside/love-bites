import { Mail } from 'lucide-react';
import { motion } from 'motion/react';
import { useState, type FormEvent } from 'react';
import { Logo } from '../../components/brand';
import { Button } from '../../components/ui';
import { cloud, rememberMember } from '../../cloud/client';
import { myDisplayName, saveDisplayName } from '../../cloud/family';

const field = 'h-14 w-full rounded-full border-2 border-ink bg-white px-5 text-base outline-none focus:ring-2 focus:ring-pop';

/** Invite-only sign in: an emailed 6-digit code, so it works inside the home-screen app with no links to juggle. */
export function SignInScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const [step, setStep] = useState<'email' | 'code' | 'name'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const c = cloud()!;

  const sendCode = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error: err } = await c.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: false } });
    setBusy(false);
    if (err) {
      setError(/signups not allowed|not found|otp_disabled/i.test(err.message) || err.status === 422 ? "That email isn't on the family list. Ask Louie to add you." : /rate|seconds/i.test(err.message) ? 'Too many codes asked for. Give it a minute and try again.' : "Couldn't send a code. Check you're online and try again.");
      return;
    }
    setStep('code');
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { data, error: err } = await c.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.replace(/\s/g, ''), type: 'email' });
    if (err || !data.user) {
      setBusy(false);
      setError("That code didn't work. Check the latest email, or send a new one.");
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
          {step === 'email' && (
            <form onSubmit={(e) => void sendCode(e)}>
              <h1 className="display text-3xl leading-tight">Hey, gorgeous.<br />What's cooking?</h1>
              <label htmlFor="email" className="mb-1.5 mt-5 block text-sm font-bold">Your email</label>
              <input id="email" type="email" inputMode="email" autoComplete="email" autoFocus required value={email} onChange={(e) => { setEmail(e.target.value); setError(''); }} className={field} />
              <Button type="submit" size="lg" icon={Mail} className="mt-4 w-full" disabled={busy || !email.includes('@')}>{busy ? 'Sending…' : 'Email me a code'}</Button>
            </form>
          )}
          {step === 'code' && (
            <form onSubmit={(e) => void verify(e)}>
              <h1 className="display text-3xl leading-tight">Check your email</h1>
              <p className="mt-2 text-sm">We sent a code to <b>{email}</b>. It can take a minute, and might be in spam.</p>
              <label htmlFor="code" className="mb-1.5 mt-4 block text-sm font-bold">Code</label>
              <input id="code" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={10} value={code} onChange={(e) => { setCode(e.target.value); setError(''); }} className={`${field} text-center text-2xl tracking-[0.3em]`} />
              <Button type="submit" size="lg" className="mt-4 w-full" disabled={busy || code.replace(/\D/g, '').length < 6}>{busy ? 'Checking…' : 'Let me in'}</Button>
              <button type="button" className="mt-3 w-full text-sm font-bold underline" onClick={() => { setStep('email'); setCode(''); setError(''); }}>Use a different email or resend</button>
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

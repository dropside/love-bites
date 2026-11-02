import { LogOut, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, Card, Field, inputClass, useFeedback } from '../../components/ui';
import { currentMember, signOut } from '../../cloud/client';
import { myDisplayName, saveDisplayName } from '../../cloud/family';
import { lastSynced, pushToCloud } from '../../cloud/sync';

export function AccountSection({ onSignedOut }: { onSignedOut: () => void }) {
  const member = currentMember();
  const { toast, confirm } = useFeedback();
  const [name, setName] = useState<string | null>(null);
  const [synced, setSynced] = useState(lastSynced);

  useEffect(() => {
    void myDisplayName().then((n) => setName(n ?? ''));
  }, []);

  const syncNow = async () => {
    const res = await pushToCloud().catch(() => 'offline' as const);
    setSynced(lastSynced());
    toast(res === 'offline' ? "Can't reach the cloud right now. It'll sync when you're back online." : 'All backed up.');
  };

  return (
    <Card>
      <h2 className="display mb-3 text-xl">Your account</h2>
      <div className="space-y-3">
        <p className="text-sm">Signed in as <b data-testid="account-email">{member?.email}</b></p>
        {name !== null && (
          <Field label="Name the family sees">
            <input key={name} className={inputClass} defaultValue={name} maxLength={40} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== name) void saveDisplayName(v).then((ok) => { if (ok) { setName(v); toast('Name saved.'); } }); }} />
          </Field>
        )}
        <p className="text-sm text-muted">Your cookbook, plans, pantry and lists back up to your account automatically and come with you to any phone you sign in on. Last backed up: {synced ? new Date(synced).toLocaleString('en-NZ') : 'not yet'}.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="white" icon={RefreshCw} onClick={() => void syncNow()}>Back up now</Button>
          <Button variant="ink" icon={LogOut} data-testid="sign-out" onClick={() => void confirm({ title: 'Sign out?', body: 'Your data is backed up first and stays on this phone too.', confirmLabel: 'Sign out' }).then(async (ok) => {
            if (!ok) return;
            await pushToCloud().catch(() => undefined);
            await signOut();
            onSignedOut();
          })}>Sign out</Button>
        </div>
      </div>
    </Card>
  );
}

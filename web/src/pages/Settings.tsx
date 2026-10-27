import { useState } from 'react';
import { Auth, Me } from '../api/endpoints';
import { errorMessage } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { confirmDialog, prompt, toast } from '../components/overlays';
import { useThemePref, type ThemePreference } from '../theme';

export default function Settings() {
  const { user, setUser, signOut } = useAuth();
  const { pref, set } = useThemePref();
  const [busy, setBusy] = useState(false);
  if (!user) return null;

  const chooseTheme = (p: ThemePreference) => {
    set(p);
    Me.update({ preferences: { theme: p } }).then((r) => setUser(r.user), () => {});
  };

  async function rename() {
    const displayName = await prompt('Your name', user!.displayName);
    if (!displayName) return;
    try {
      setUser((await Me.update({ displayName })).user);
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  async function exportData() {
    // The export endpoint needs the bearer token, so fetch it through the API client and save as a file.
    try {
      const data = await (await import('../api/client')).api<unknown>('/me/export');
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: 'mymusic-export.json' });
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  async function deleteAccount() {
    const ok = await confirmDialog('Delete your account?', 'Your playlists, likes and history will be permanently deleted and any subscription cancelled.', 'Delete account', true);
    if (!ok) return;
    setBusy(true);
    try {
      await Me.delete();
      await signOut();
    } catch (e) {
      toast(errorMessage(e));
      setBusy(false);
    }
  }

  const planName = user.subscription.plan === 'free' ? 'Free' : user.subscription.plan === 'family' ? 'Family' : 'Premium';

  return (
    <div className="list-settings">
      <h1 className="page-title">Settings</h1>
      <h2>Account</h2>
      <div className="setting">
        <span>
          Name <div className="muted">{user.displayName}</div>
        </span>
        <button className="btn btn-secondary btn-sm" onClick={rename}>
          Edit
        </button>
      </div>
      <div className="setting">
        <span>
          Email <div className="muted">{user.email ?? 'Hidden'}{user.email && !user.emailVerified ? ' · not verified' : ''}</div>
        </span>
        {user.email && !user.emailVerified && (
          <button className="btn btn-secondary btn-sm" onClick={() => Auth.resendVerification().then(() => toast('Verification email sent'), (e) => toast(errorMessage(e)))}>
            Resend verification
          </button>
        )}
      </div>
      <div className="setting">
        <span>
          Plan <div className="muted">{planName}</div>
        </span>
        <a className="btn btn-secondary btn-sm" href="/premium">
          {user.subscription.plan === 'free' ? 'Upgrade' : 'Manage'}
        </a>
      </div>

      <h2 style={{ marginTop: 32 }}>Display</h2>
      <div className="setting">
        <span>Theme</span>
        <div className="seg" role="radiogroup" aria-label="Theme">
          {(['system', 'dark', 'light'] as const).map((p) => (
            <button key={p} role="radio" aria-checked={pref === p} className={pref === p ? 'on' : ''} onClick={() => chooseTheme(p)}>
              {p[0].toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <h2 style={{ marginTop: 32 }}>Privacy</h2>
      <div className="setting">
        <span>Download your data</span>
        <button className="btn btn-secondary btn-sm" onClick={exportData}>
          Export
        </button>
      </div>
      <div className="setting">
        <span>YouTube Terms of Service</span>
        <a className="btn btn-secondary btn-sm" href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">
          Open
        </a>
      </div>
      <div className="setting">
        <span>Google Privacy Policy</span>
        <a className="btn btn-secondary btn-sm" href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">
          Open
        </a>
      </div>

      <h2 style={{ marginTop: 32 }}>Session</h2>
      <div className="setting">
        <span>Log out of every device</span>
        <button className="btn btn-secondary btn-sm" onClick={() => signOut({ everywhere: true })}>
          Log out everywhere
        </button>
      </div>
      <div className="setting">
        <span>Delete account</span>
        <button className="btn btn-danger btn-sm" disabled={busy} onClick={deleteAccount}>
          Delete
        </button>
      </div>
    </div>
  );
}

import { useQuery } from '@tanstack/react-query';
import { useCallback, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Auth, Config } from '../api/endpoints';
import { keys } from '../api/queryClient';
import { errorMessage } from '../api/client';
import type { Session } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { AppleButton, GoogleButton } from '../auth/social';
import { Icon } from '../components/Icon';

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--accent)' }}>
          <Icon name="note" size={40} />
        </div>
        <h1>{title}</h1>
        {children}
      </div>
    </div>
  );
}

function useFinish() {
  const { completeSignIn } = useAuth();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/';
  return useCallback(
    (s: Session) => {
      completeSignIn(s);
      navigate(from, { replace: true });
    },
    [completeSignIn, navigate, from],
  );
}

function Social({ onError }: { onError: (m: string) => void }) {
  const finish = useFinish();
  const { data: config } = useQuery({ queryKey: keys.config, queryFn: Config.get, staleTime: Infinity });
  if (!config?.googleClientId && !config?.appleServicesId) return null;
  return (
    <>
      <div className="social">
        <GoogleButton config={config} onSession={finish} onError={onError} />
        <AppleButton config={config} onSession={finish} onError={onError} />
      </div>
      <div className="divider">or</div>
    </>
  );
}

export function Login() {
  const finish = useFinish();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      finish(await Auth.login(email.trim(), password));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Log in to MyMusic">
      <Social onError={setError} />
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p className="error-text">{error}</p>}
        <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>
          {busy ? 'Logging in…' : 'Log in'}
        </button>
      </form>
      <p style={{ textAlign: 'center' }}>
        <Link to="/forgot-password" style={{ textDecoration: 'underline' }}>
          Forgot your password?
        </Link>
      </p>
      <p className="muted" style={{ textAlign: 'center' }}>
        Don’t have an account?{' '}
        <Link to="/signup" style={{ color: 'var(--text)', textDecoration: 'underline' }}>
          Sign up for MyMusic
        </Link>
      </p>
    </Card>
  );
}

export function Register() {
  const finish = useFinish();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 10) return setError('Use at least 10 characters for your password.');
    setBusy(true);
    setError(null);
    try {
      finish(await Auth.register(email.trim(), password, name.trim()));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Sign up to start listening">
      <Social onError={setError} />
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="name">What should we call you?</label>
          <input id="name" className="input" autoComplete="name" maxLength={60} required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" className="input" type="password" autoComplete="new-password" minLength={10} maxLength={72} required placeholder="At least 10 characters" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <p className="muted small">
          By signing up you agree to the MyMusic Terms of Use and Privacy Policy, and to the{' '}
          <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>
            YouTube Terms of Service
          </a>{' '}
          for YouTube content.
        </p>
        {error && <p className="error-text">{error}</p>}
        <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>
          {busy ? 'Creating account…' : 'Sign up'}
        </button>
      </form>
      <p className="muted" style={{ textAlign: 'center' }}>
        Already have an account?{' '}
        <Link to="/login" style={{ color: 'var(--text)', textDecoration: 'underline' }}>
          Log in
        </Link>
      </p>
    </Card>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await Auth.forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Card title="Reset your password">
      {sent ? (
        <p className="muted" style={{ textAlign: 'center' }}>
          If an account exists for {email}, we’ve emailed a link to reset your password. It’s valid for 30 minutes.
        </p>
      ) : (
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {error && <p className="error-text">{error}</p>}
          <button className="btn btn-primary" style={{ width: '100%' }}>
            Send link
          </button>
        </form>
      )}
      <p style={{ textAlign: 'center' }}>
        <Link to="/login" style={{ textDecoration: 'underline' }}>
          Back to log in
        </Link>
      </p>
    </Card>
  );
}

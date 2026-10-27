/**
 * "Sign in with Google" (Google Identity Services) and "Sign in with Apple"
 * (Apple JS). Both return a signed ID token that the API verifies.
 * The buttons only appear when the server provides client ids via /config.
 */
import { useEffect, useRef, useState } from 'react';
import { Auth, type PublicConfig } from '../api/endpoints';
import type { Session } from '../api/types';
import { Icon } from '../components/Icon';

type GoogleId = {
  accounts: {
    id: {
      initialize: (o: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: string }) => void;
      renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
    };
  };
};
type AppleId = {
  auth: {
    init: (o: { clientId: string; scope: string; redirectURI: string; usePopup: boolean; nonce: string }) => void;
    signIn: () => Promise<{ authorization: { id_token: string; code?: string }; user?: { name?: { firstName?: string; lastName?: string } } }>;
  };
};
declare global {
  interface Window {
    google?: GoogleId;
    AppleID?: AppleId;
  }
}

const loaded = new Map<string, Promise<void>>();
function loadScript(src: string) {
  if (!loaded.has(src)) {
    loaded.set(
      src,
      new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.head.appendChild(s);
      }),
    );
  }
  return loaded.get(src)!;
}

async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

type Props = { config: PublicConfig | undefined; onSession: (s: Session) => void; onError: (msg: string) => void };

export function GoogleButton({ config, onSession, onError }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const clientId = config?.googleClientId;

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    loadScript('https://accounts.google.com/gsi/client')
      .then(() => {
        if (cancelled || !ref.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: ({ credential }) => Auth.google(credential).then(onSession, (e) => onError(e.message)),
        });
        window.google.accounts.id.renderButton(ref.current, { theme: 'filled_black', size: 'large', shape: 'pill', text: 'continue_with', width: 320 });
      })
      .catch(() => onError('Google sign-in is unavailable right now'));
    return () => {
      cancelled = true;
    };
  }, [clientId, onSession, onError]);

  return clientId ? <div ref={ref} /> : null;
}

export function AppleButton({ config, onSession, onError }: Props) {
  const servicesId = config?.appleServicesId;
  const [busy, setBusy] = useState(false);
  if (!servicesId) return null;

  async function signIn() {
    setBusy(true);
    try {
      await loadScript('https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js');
      // Apple embeds the nonce we pass; we pass sha256(raw) and the server checks it against raw.
      const raw = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('');
      window.AppleID!.auth.init({ clientId: servicesId!, scope: 'name email', redirectURI: window.location.origin, usePopup: true, nonce: await sha256Hex(raw) });
      const res = await window.AppleID!.auth.signIn();
      const n = res.user?.name;
      const fullName = [n?.firstName, n?.lastName].filter(Boolean).join(' ') || undefined;
      onSession(await Auth.apple({ identityToken: res.authorization.id_token, nonce: raw, authorizationCode: res.authorization.code, fullName }));
    } catch (e) {
      const err = e as { error?: string; message?: string };
      if (err?.error !== 'popup_closed_by_user') onError(err?.message ?? 'Apple sign-in failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className="apple-btn" onClick={signIn} disabled={busy}>
      <Icon name="apple" size={20} /> Continue with Apple
    </button>
  );
}

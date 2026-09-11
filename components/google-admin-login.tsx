'use client';

import { useEffect, useRef, useState } from 'react';
import { loadJson } from '@/lib/listener-loading';

type GoogleIdentity = {
  initialize: (options: {
    client_id: string;
    nonce: string;
    auto_select: boolean;
    callback: (result: { credential: string }) => void;
  }) => void;
  renderButton: (
    parent: HTMLElement,
    options: Record<string, string | number>,
  ) => void;
};

type Viewer = {
  email: string;
  name: string;
  role: 'Bosh admin';
  permissions: string[];
};

let googleScript: Promise<GoogleIdentity> | undefined;

function loadGoogleIdentity() {
  const identity = () =>
    (window as Window & { google?: { accounts: { id: GoogleIdentity } } })
      .google?.accounts.id;
  if (identity()) return Promise.resolve(identity()!);
  if (!googleScript) {
    googleScript = new Promise<GoogleIdentity>((resolve, reject) => {
      const script = document.createElement('script');
      const timeout = window.setTimeout(() => {
        script.remove();
        reject(new Error('Google tugmasi yuklanmadi. Sahifani yangilang.'));
      }, 15000);
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = () => {
        window.clearTimeout(timeout);
        const api = identity();
        if (api) resolve(api);
        else reject(new Error('Google orqali kirish yuklanmadi.'));
      };
      script.onerror = () => {
        window.clearTimeout(timeout);
        script.remove();
        reject(
          new Error('Google bilan aloqa o‘rnatilmadi. Sahifani yangilang.'),
        );
      };
      document.head.appendChild(script);
    }).catch((error: unknown) => {
      googleScript = undefined;
      throw error;
    });
  }
  return googleScript;
}

export function GoogleAdminLogin({
  onAuthenticated,
}: {
  onAuthenticated?: (viewer: Viewer) => void;
}) {
  const button = useRef<HTMLDivElement>(null);
  const onSuccess = useRef(onAuthenticated);
  const pending = useRef(false);
  const [message, setMessage] = useState(
    'Google orqali kirish tekshirilmoqda…',
  );
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [retry, setRetry] = useState(false);
  useEffect(() => {
    onSuccess.current = onAuthenticated;
  }, [onAuthenticated]);

  useEffect(() => {
    const controller = new AbortController();
    setRetry(false);
    setError(false);
    setMessage('Google orqali kirish tekshirilmoqda…');
    button.current?.replaceChildren();
    void (async () => {
      try {
        const config = await loadJson<{
          enabled?: boolean;
          clientId?: string;
          nonce?: string;
          error?: string;
        }>('/api/admin/google', { signal: controller.signal });
        if (!config.enabled || !config.clientId || !config.nonce) {
          setMessage('Google orqali parolsiz kirish hali ulanmagan.');
          setRetry(true);
          return;
        }
        const google = await loadGoogleIdentity();
        if (controller.signal.aborted || !button.current) return;
        google.initialize({
          client_id: config.clientId,
          nonce: config.nonce,
          auto_select: false,
          callback: ({ credential }) => {
            if (controller.signal.aborted || pending.current) return;
            pending.current = true;
            setError(false);
            setMessage('Google akkaunti tasdiqlanmoqda…');
            void (async () => {
              try {
                const result = await loadJson<{
                  authenticated?: boolean;
                  viewer?: Viewer;
                  error?: string;
                }>('/api/admin/google', {
                  method: 'POST',
                  signal: controller.signal,
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ credential }),
                });
                if (!result.authenticated || !result.viewer) {
                  throw new Error(
                    result.error || 'Google akkaunti tasdiqlanmadi.',
                  );
                }
                onSuccess.current?.(result.viewer);
              } catch (failure) {
                if (controller.signal.aborted) return;
                setError(true);
                setRetry(true);
                setMessage(
                  failure instanceof Error
                    ? failure.message
                    : 'Kirish amalga oshmadi.',
                );
              } finally {
                pending.current = false;
              }
            })();
          },
        });
        google.renderButton(button.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          width: 280,
        });
        setMessage(
          'Bosh admin Google akkauntingizni tanlang. Alohida sayt paroli kerak emas.',
        );
      } catch (failure) {
        if (controller.signal.aborted) return;
        setError(true);
        setRetry(true);
        setMessage(
          failure instanceof Error
            ? failure.message
            : 'Google bilan aloqa o‘rnatilmadi.',
        );
      }
    })();
    return () => controller.abort();
  }, [attempt]);

  return (
    <div className="google-admin-login">
      <div ref={button} />
      <p
        className={error ? 'admin-login-error' : ''}
        role={error ? 'alert' : 'status'}
      >
        {message}
      </p>
      {retry && (
        <button type="button" onClick={() => setAttempt((value) => value + 1)}>
          Google kirishini qayta tekshirish
        </button>
      )}
    </div>
  );
}

'use client';

/* ============================================
   LOWPASS — PublicRiderView

   Client component for /r/[token]. Handles:
   - Initial POST to /api/public/rider/[token] with no password.
   - 401 requires_password -> render password form.
   - 401 invalid_password -> render password form with error.
   - 404 -> render not-found state.
   - 200 -> render ReadOnlyPackView.
   ============================================ */

import { useCallback, useEffect, useState } from 'react';
import { ReadOnlyPackView } from './ReadOnlyPackView';
import type { PublicRiderPayload } from '@/lib/rider-packs/web-links';

type State =
  | { kind: 'loading' }
  | { kind: 'needs_password'; invalid: boolean }
  | { kind: 'not_found' }
  | { kind: 'error'; message: string }
  | { kind: 'ok'; payload: PublicRiderPayload };

export function PublicRiderView({
  token,
  printMode = false,
}: {
  token: string;
  /* Sprint 12 §10 — set when /r/[token]?print=1. Strips
     loading/error/password chrome to plain text (so a
     browser-driven "Save as PDF" doesn't put a card around
     them) and passes the flag through to ReadOnlyPackView so
     it can apply the lp-pdf-* page-break hooks. */
  printMode?: boolean;
}) {
  const [state, setState] = useState<State>({ kind: 'loading' });

  const attempt = useCallback(
    async (password: string | null) => {
      try {
        const res = await fetch(`/api/public/rider/${encodeURIComponent(token)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(password ? { password } : {}),
        });

        if (res.ok) {
          const payload = (await res.json()) as PublicRiderPayload;
          setState({ kind: 'ok', payload });
          return;
        }

        if (res.status === 404) {
          setState({ kind: 'not_found' });
          return;
        }

        if (res.status === 401) {
          const body = await res.json().catch(() => ({}));
          if (body?.requires_password) {
            setState({ kind: 'needs_password', invalid: false });
            return;
          }
          if (body?.invalid_password) {
            setState({ kind: 'needs_password', invalid: true });
            return;
          }
        }

        setState({ kind: 'error', message: `Unexpected status ${res.status}` });
      } catch (e) {
        setState({
          kind: 'error',
          message: e instanceof Error ? e.message : 'Network error',
        });
      }
    },
    [token],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void attempt(null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [attempt]);

  if (state.kind === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-neutral-500">
        Loading...
      </div>
    );
  }

  if (state.kind === 'not_found') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="max-w-md p-6 text-center space-y-2">
          <div className="text-lg font-semibold">Link not found</div>
          <div className="text-sm text-neutral-500">
            This link may have been revoked or is incorrect.
          </div>
        </div>
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="max-w-md p-6 text-center space-y-2">
          <div className="text-lg font-semibold">Something went wrong</div>
          <div className="text-sm text-neutral-500">{state.message}</div>
        </div>
      </div>
    );
  }

  if (state.kind === 'needs_password') {
    return <PasswordForm invalid={state.invalid} onSubmit={(p) => attempt(p)} />;
  }

  return <ReadOnlyPackView payload={state.payload} printMode={printMode} />;
}

function PasswordForm({
  invalid,
  onSubmit,
}: {
  invalid: boolean;
  onSubmit: (password: string) => void;
}) {
  const [value, setValue] = useState('');

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (value) onSubmit(value);
        }}
        className="w-full max-w-sm space-y-3 rounded border border-neutral-200 bg-white p-6"
      >
        <div className="space-y-1">
          <div className="text-lg font-semibold">Password required</div>
          <div className="text-sm text-neutral-500">
            This rider is protected. Enter the password to view.
          </div>
        </div>

        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
          className="w-full rounded border border-neutral-200 px-3 py-2 text-sm"
          placeholder="Password"
        />

        {invalid && <div className="text-xs text-red-600">Incorrect password. Try again.</div>}

        <button
          type="submit"
          disabled={!value}
          className="w-full rounded bg-[var(--lp-orange)] px-3 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
        >
          Unlock
        </button>
      </form>
    </div>
  );
}

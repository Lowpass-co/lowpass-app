'use client';

/* ============================================
   <NoWorkspace> — signed in, but no workspace we can open (Nov 2026, Adam)

   Shown by the (workspace) layout instead of redirect('/login'). That
   redirect looped for a signed-in account: the middleware sends a
   signed-in user away from /login straight back to /artists, which sent
   them to /login again — the page just kept reloading. Here the person
   sees what's wrong and can sign out (or try again once it's fixed).

   The cause it was built for (a new sign-up with no workspace membership)
   is fixed by migration 290; this stays as the floor for any other cause.
   ============================================ */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { createClient as createBrowserSupabase } from '@/lib/supabase-client';

export function NoWorkspace({ email }: { email: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    setBusy(true);
    try {
      await createBrowserSupabase().auth.signOut();
    } catch {
      /* the redirect below still leaves the app */
    }
    router.replace('/login');
    router.refresh();
  };

  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        padding: 'var(--lp-space-6)',
        background: 'var(--lp-bg)',
        color: 'var(--lp-text)',
      }}
    >
      <div style={{ maxWidth: 440, display: 'grid', gap: 'var(--lp-space-4)' }}>
        <h1 className="lp-page-title" style={{ margin: 0 }}>
          We can’t open your workspace
        </h1>
        <p style={{ margin: 0, color: 'var(--lp-text-secondary)', lineHeight: 1.5 }}>
          You’re signed in{email ? ` as ${email}` : ''}, but this account isn’t connected to a
          workspace Lowpass can open. If you were invited, open the invite link again. Otherwise
          let the person who set up your Lowpass know — nothing you’ve done is lost.
        </p>
        <div style={{ display: 'flex', gap: 'var(--lp-space-2)' }}>
          <Button variant="primary" onClick={() => router.refresh()} disabled={busy}>
            Try again
          </Button>
          <Button variant="secondary" onClick={signOut} disabled={busy}>
            Sign out
          </Button>
        </div>
      </div>
    </main>
  );
}

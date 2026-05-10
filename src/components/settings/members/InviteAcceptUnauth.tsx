'use client';

/* ============================================
   LOWPASS — <InviteAcceptUnauth> (Sprint 9 §14.3)

   Shown on /invite/accept when the visitor isn't logged in.
   Replaces the prior page-level redirect-to-login (which
   silently dropped the invite token whenever the login form's
   `next` URL parsing collided with the unencoded second
   "?token=" segment in the redirect URL).

   Renders two buttons:
     - Sign in to accept   → /login?next=<encoded next URL>
     - Create account     → /signup?next=<encoded next URL>

   Both preserve the original /invite/accept?token=… URL via a
   single fully-encoded `next` param so the post-auth router
   can land back here.
   ============================================ */

import Link from 'next/link';

interface InviteAcceptUnauthProps {
  token: string;
}

export function InviteAcceptUnauth({ token }: InviteAcceptUnauthProps) {
  // Build the next URL once with full encoding — the entire
  // value is encoded so query separators inside it don't get
  // interpreted as login-page params.
  const nextUrl = `/invite/accept?token=${encodeURIComponent(token)}`;
  const encodedNext = encodeURIComponent(nextUrl);
  const loginHref = `/login?next=${encodedNext}`;
  const signupHref = `/signup?next=${encodedNext}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lp-space-3)' }}>
      <p
        style={{
          margin: 0,
          fontSize: 'var(--lp-text-sm)',
          color: 'var(--lp-text-secondary)',
        }}
      >
        You&apos;ve been invited to a Lowpass workspace. Sign in to your
        account to accept, or create a new account if you don&apos;t have
        one yet.
      </p>
      <div style={{ display: 'flex', gap: 'var(--lp-space-2)', flexWrap: 'wrap' }}>
        <Link
          href={loginHref}
          className="btn-transition btn-primary-press inline-flex items-center justify-center"
          style={{
            padding: 'var(--lp-space-2) var(--lp-space-4)',
            fontSize: 'var(--lp-text-sm)',
            fontWeight: 'var(--lp-weight-semibold)',
            color: 'var(--lp-text-inverse)',
            background: 'var(--color-lp-orange)',
            border: '1px solid transparent',
            borderRadius: 'var(--lp-radius-md)',
            textDecoration: 'none',
          }}
        >
          Sign in to accept
        </Link>
        <Link
          href={signupHref}
          className="btn-transition inline-flex items-center justify-center"
          style={{
            padding: 'var(--lp-space-2) var(--lp-space-4)',
            fontSize: 'var(--lp-text-sm)',
            fontWeight: 'var(--lp-weight-medium)',
            color: 'var(--lp-text)',
            background: 'transparent',
            border: '1px solid var(--lp-border-strong)',
            borderRadius: 'var(--lp-radius-md)',
            textDecoration: 'none',
          }}
        >
          Create account to accept
        </Link>
      </div>
      <p
        style={{
          margin: 0,
          marginTop: 'var(--lp-space-1)',
          fontSize: 'var(--lp-text-xs)',
          color: 'var(--lp-text-tertiary)',
        }}
      >
        New accounts confirm via email. After confirming, return to
        this invite link to finish accepting.
      </p>
    </div>
  );
}

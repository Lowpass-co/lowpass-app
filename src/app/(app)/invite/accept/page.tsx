/* ============================================
   LOWPASS — Invite acceptance landing (Sprint 9 §3 + §14.3)

   /invite/accept?token=<token>

   When the admin shares an invite link, the invitee lands here.
   Two paths:
     - Not authed: render <InviteAcceptUnauth> with sign-in /
       sign-up buttons that preserve the token via a fully-
       encoded `next` param. After auth the post-login redirect
       lands back here. Sprint 9 §14.3 — replaces the previous
       redirect-to-login that silently dropped the token because
       its `next` URL wasn't fully encoded.
     - Authed: server doesn't auto-accept (we want the invitee
       to consciously click Accept). The page renders an
       <InviteAcceptClient> client component that calls POST
       /api/workspaces/invite/accept on user click.

   The client component handles all error surfaces (already
   accepted / expired / email mismatch / generic) so the user
   gets clear feedback instead of a stack trace.
   ============================================ */

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { InviteAcceptClient } from '@/components/settings/members/InviteAcceptClient';
import { InviteAcceptUnauth } from '@/components/settings/members/InviteAcceptUnauth';

export const dynamic = 'force-dynamic';

interface InviteAcceptPageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function InviteAcceptPage({
  searchParams,
}: InviteAcceptPageProps) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <Frame title="Invalid invite link">
        <p style={{ margin: 0, fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)' }}>
          This invite link is missing its token. Ask your admin to resend the
          invite from <code>/settings/members</code>.
        </p>
      </Frame>
    );
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <Frame title="You&rsquo;ve been invited">
        <InviteAcceptUnauth token={token} />
      </Frame>
    );
  }

  return (
    <Frame title="Accept workspace invite">
      <InviteAcceptClient token={token} userEmail={user.email ?? ''} />
    </Frame>
  );
}

function Frame({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--lp-space-4)',
        background: 'var(--lp-dashboard-bg)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 440,
          padding: 'var(--lp-space-5)',
          background: 'var(--lp-surface)',
          border: '1px solid var(--lp-border-strong)',
          borderRadius: 'var(--lp-radius-lg)',
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: 'var(--lp-text-xl)',
            fontWeight: 'var(--lp-weight-bold)',
            color: 'var(--lp-text)',
          }}
        >
          {title}
        </h1>
        <div style={{ marginTop: 'var(--lp-space-3)' }}>{children}</div>
      </div>
    </div>
  );
}

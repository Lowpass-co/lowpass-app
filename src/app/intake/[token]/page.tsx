/* ============================================
   LOWPASS — /intake/[token] (Sprint 10 §2.4)

   Public-shareable personnel intake form. NOT inside the (app)
   route group — no auth gate. The visitor lands here from a
   link the workspace admin generated; fills in their own info;
   submits.

   Server component does the token lookup so an invalid /
   expired / already-used token shows a panel instead of a form.
   The form itself is a small client component that POSTs to
   /api/intake/[token]/submit.
   ============================================ */

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { IntakeForm } from '@/components/intake/IntakeForm';

interface IntakePageProps {
  params: Promise<{ token: string }>;
}

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Personnel info form — Lowpass' };

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        padding: 'var(--lp-space-4)',
        background: 'var(--lp-dashboard-bg)',
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 640,
          marginTop: 'var(--lp-space-6)',
          padding: 'var(--lp-space-5)',
          background: 'var(--lp-surface)',
          border: '1px solid var(--lp-border-strong)',
          borderRadius: 'var(--lp-radius-lg)',
        }}
      >
        {children}
      </div>
    </div>
  );
}

export default async function IntakePage({ params }: IntakePageProps) {
  const { token } = await params;
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .rpc('lookup_personnel_intake', { p_token: token })
    .maybeSingle();

  if (error || !data) {
    return (
      <Frame>
        <h1 style={{ margin: 0, fontSize: 'var(--lp-text-xl)', fontWeight: 700 }}>
          This personnel info form link isn&apos;t valid
        </h1>
        <p
          style={{
            marginTop: 'var(--lp-space-3)',
            fontSize: 'var(--lp-text-sm)',
            color: 'var(--lp-text-secondary)',
          }}
        >
          The link may have expired or already been used. Ask the
          person who shared it to generate a fresh link.
        </p>
      </Frame>
    );
  }

  const row = data as {
    token: string;
    workspace_name: string;
    personnel_name: string;
    expires_at: string;
    submitted_at: string | null;
  };

  if (row.submitted_at) {
    return (
      <Frame>
        <h1 style={{ margin: 0, fontSize: 'var(--lp-text-xl)', fontWeight: 700 }}>
          Thanks — your details are in
        </h1>
        <p
          style={{
            marginTop: 'var(--lp-space-3)',
            fontSize: 'var(--lp-text-sm)',
            color: 'var(--lp-text-secondary)',
          }}
        >
          {row.workspace_name} has received your personnel info
          form. You can close this window. If anything needs to
          change, ask the person who sent the link to generate
          a fresh one.
        </p>
      </Frame>
    );
  }

  return (
    <Frame>
      <h1 style={{ margin: 0, fontSize: 'var(--lp-text-xl)', fontWeight: 700 }}>
        {row.workspace_name} — Personnel info form
      </h1>
      <p
        style={{
          marginTop: 'var(--lp-space-2)',
          fontSize: 'var(--lp-text-sm)',
          color: 'var(--lp-text-secondary)',
        }}
      >
        Fill in your touring info — passport, emergency contact,
        dietary, merch sizes. Anything you skip can be added
        later. Your tour manager will see this once you submit.
      </p>
      <p
        style={{
          marginTop: 'var(--lp-space-2)',
          fontSize: 'var(--lp-text-xs)',
          color: 'var(--lp-text-tertiary)',
        }}
      >
        For: {row.personnel_name}
      </p>
      <div style={{ marginTop: 'var(--lp-space-4)' }}>
        <IntakeForm token={row.token} />
      </div>
    </Frame>
  );
}

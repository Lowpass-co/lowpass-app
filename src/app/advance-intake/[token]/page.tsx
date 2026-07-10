/* ============================================
   LOWPASS — Public venue advance-intake form (T3.2)

   /advance-intake/[token] — unauthenticated, outside the (app) shell
   so the venue sees a clean branded form with no app nav. (Distinct
   from /intake/[token], which is the personnel info form — Sprint 10.)

   Loads the link + form schema via the service-role client (resolved
   strictly by token) and renders <VenueIntakeForm>. NEVER surfaces the
   TM's existing advance data — only the venue's own prior answers.

   Lifecycle states handled inline: not-found / revoked / expired /
   ready. Submitted links still render the form (prefilled) so a venue
   can correct answers; the submit route accepts updates.
   ============================================ */

import { createServiceSupabaseClient } from '@/lib/supabase-server';
import {
  buildIntakeFormSchema,
  type IntakeSection,
  type AdvanceData,
} from '@/lib/advance/intake';
import { buildPrefillProposals, proposalsToMap } from '@/lib/advance/intake-prefill';
import { loadPrefillContext } from '@/lib/advance/intake-prefill-server';
import { VenueIntakeForm } from '@/components/advance/VenueIntakeForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Advance request — Lowpass' };

interface LinkRow {
  id: string;
  workspace_id: string;
  tour_id: string;
  routing_id: string;
  status: string;
  expires_at: string | null;
  revoked_at: string | null;
  recipient_name: string | null;
  submitted_data: AdvanceData | null;
}

/** Module-level (non-component) so the impurity rule doesn't flag the
 *  Date.now() read inside the page's render. */
function isExpired(iso: string | null): boolean {
  if (!iso) return false;
  return new Date(iso).getTime() < Date.now();
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main
      className="flex min-h-screen w-full justify-center"
      style={{ background: 'var(--lp-bg-deep)', padding: '40px 16px' }}
    >
      <div className="w-full" style={{ maxWidth: 720 }}>
        {children}
      </div>
    </main>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <Shell>
      <div
        className="rounded-2xl border p-8 text-center"
        style={{
          borderColor: 'var(--lp-border-strong)',
          background: 'var(--lp-surface)',
        }}
      >
        <h1
          className="font-display"
          style={{ fontSize: 22, fontWeight: 700, color: 'var(--lp-text)' }}
        >
          {title}
        </h1>
        <p style={{ marginTop: 8, fontSize: 14, color: 'var(--lp-text-secondary)' }}>
          {body}
        </p>
      </div>
    </Shell>
  );
}

export default async function AdvanceIntakePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const service = createServiceSupabaseClient();

  const { data: link } = await service
    .from('advance_intake_links')
    .select(
      'id, workspace_id, tour_id, routing_id, status, expires_at, revoked_at, recipient_name, submitted_data',
    )
    .eq('token', token)
    .maybeSingle<LinkRow>();

  if (!link || link.revoked_at || link.status === 'revoked') {
    return (
      <Notice
        title="This link isn’t available"
        body="The advance request link is invalid or has been revoked. Please ask your contact for a new link."
      />
    );
  }

  if (isExpired(link.expires_at)) {
    return (
      <Notice
        title="This link has expired"
        body="This advance request is no longer accepting responses. Please ask your contact for a new link."
      />
    );
  }

  const { data: instance } = await service
    .from('advance_instances')
    .select('sections, data')
    .eq('routing_id', link.routing_id)
    .maybeSingle<{ sections: IntakeSection[] | null; data: AdvanceData | null }>();

  const [{ data: routing }, { data: tour }] = await Promise.all([
    service
      .from('routing')
      .select('date, venue_name, city, address')
      .eq('id', link.routing_id)
      .maybeSingle<{
        date: string | null;
        venue_name: string | null;
        city: string | null;
        address: string | null;
      }>(),
    service
      .from('tours')
      .select('name')
      .eq('id', link.tour_id)
      .maybeSingle<{ name: string | null }>(),
  ]);

  const schema = buildIntakeFormSchema(instance?.sections);

  if (schema.sections.length === 0) {
    return (
      <Notice
        title="Nothing to fill in yet"
        body="This advance request doesn’t have any questions set up yet. Please check back later or contact the sender."
      />
    );
  }

  const dateLabel = routing?.date
    ? new Date(`${routing.date.slice(0, 10)}T12:00:00Z`).toLocaleDateString(
        'en-GB',
        { day: '2-digit', month: 'short', year: 'numeric' },
      )
    : null;

  // Checkpoint B — prefill PROPOSALS (never the current advance's TM data). The
  // instance.data is used ONLY server-side to skip already-answered fields; only
  // the proposal VALUES (from the prior same-venue advance / canonical) reach the
  // venue, tagged with provenance.
  const prefill = await loadPrefillContext(service, {
    workspaceId: link.workspace_id,
    routingId: link.routing_id,
  });
  const prefillResult = buildPrefillProposals(schema, instance?.data ?? null, prefill.prior, prefill.canonical);
  const proposals = proposalsToMap(prefillResult.proposals);

  return (
    <Shell>
      <VenueIntakeForm
        token={token}
        alreadySubmitted={link.status === 'submitted'}
        show={{
          venueName: routing?.venue_name ?? null,
          city: routing?.city ?? null,
          address: routing?.address ?? null,
          dateLabel,
          tourName: tour?.name ?? null,
        }}
        schema={schema}
        initialAnswers={link.submitted_data ?? {}}
        proposals={proposals}
      />
    </Shell>
  );
}

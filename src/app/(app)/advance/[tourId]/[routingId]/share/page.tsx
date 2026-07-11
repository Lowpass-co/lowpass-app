/* ============================================================
   LOWPASS — Advance · Share surface (P3 · B4 · VIS-AS)

   Replaces the B1 redirect-to-/packet with the real Share surface. Server
   component: fetches the advance instance's sections so the venue-view preview
   can show which sections a venue sees vs. which are TM-only (hidden), and
   derives the venue-fillable counts via buildIntakeFormSchema (the same schema
   the public intake form uses). No raw venue_* reads — sections are structural.
   ============================================================ */

import { notFound, redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import {
  buildIntakeFormSchema,
  type IntakeSection,
} from '@/lib/advance/intake';
import {
  ShareSurface,
  type ShareSectionView,
  type ShareActivityEvent,
} from '@/components/advance/ShareSurface';

export const dynamic = 'force-dynamic';

const NON_FILLABLE = new Set(['file', 'contact']);

export default async function AdvanceSharePage({
  params,
}: {
  params: Promise<{ tourId: string; routingId: string }>;
}) {
  const { tourId, routingId } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/advance/${tourId}/${routingId}/share`);

  const { data: instance } = await supabase
    .from('advance_instances')
    .select('id, sections')
    .eq('routing_id', routingId)
    .maybeSingle();
  if (!instance) notFound();

  const rawSections = ((instance as { sections?: unknown }).sections ??
    []) as IntakeSection[];

  // Venue-fillable schema (drops tm_only sections + file/contact fields) — the
  // exact set the public intake form exposes.
  const venueSchema = buildIntakeFormSchema(rawSections);
  const fillableByTemplate = new Map(
    venueSchema.sections.map((s) => [s.template_id, s.fields.length]),
  );
  const fillableTotal = venueSchema.sections.reduce(
    (n, s) => n + s.fields.length,
    0,
  );

  // Per-section view for the preview — EVERY section is listed (tm_only shown as
  // hidden, never omitted).
  const sectionViews: ShareSectionView[] = rawSections.map((s) => {
    const total = (s.fields ?? []).length;
    const fillable = s.tm_only
      ? 0
      : fillableByTemplate.get(s.template_id) ??
        (s.fields ?? []).filter((f) => !NON_FILLABLE.has(f.type)).length;
    return {
      templateId: s.template_id,
      label: s.label,
      tmOnly: !!s.tm_only,
      totalFields: total,
      venueFillable: fillable,
    };
  });

  // VIS-AS-05 — real activity from the intake link's persisted timestamps.
  // opened = last_viewed_at, submitted = submitted_at. Downloads aren't tracked
  // (no events table) so they're never fabricated here — ShareSurface flags them.
  const { data: links } = await supabase
    .from('advance_intake_links')
    .select('last_viewed_at, submitted_at, submitted_by_name, status, revoked_at')
    .eq('tour_id', tourId)
    .eq('routing_id', routingId)
    .order('created_at', { ascending: false });

  const activity: ShareActivityEvent[] = [];
  for (const l of (links ?? []) as {
    last_viewed_at: string | null;
    submitted_at: string | null;
    submitted_by_name: string | null;
    status: string | null;
    revoked_at: string | null;
  }[]) {
    if (l.revoked_at) continue;
    if (l.submitted_at) {
      activity.push({ kind: 'submitted', at: l.submitted_at, who: l.submitted_by_name });
    }
    if (l.last_viewed_at) {
      activity.push({ kind: 'opened', at: l.last_viewed_at });
    }
  }
  // Newest first.
  activity.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <ShareSurface
      tourId={tourId}
      routingId={routingId}
      sections={sectionViews}
      fillableTotal={fillableTotal}
      activity={activity}
    />
  );
}

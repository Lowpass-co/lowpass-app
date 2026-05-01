/* ============================================
   LOWPASS — Advance · Per-show page (Visual redesign §A)

   /advance/[tourId]/[routingId] — three-zone layout per Adam's
   reference HTMLs:

     <ProductShell>
       <ProductHeader>            (Phase 1 shell-v2)
       <AdvanceSubHeader>         (sub-header: tabs + Export PDF)
       <flex>                     (sidebar + main)
         <AdvanceUpcomingSidebar> (280px, upcoming shows)
         <main>
           <AdvanceShowHeader>    (sticky big-header + progress)
           {Show | Builder body}
         </main>
       </flex>
     </ProductShell>

   Tab routing keeps ?mode=edit (Option A — minimum diff). Read mode
   = AdvanceShowReadView; edit mode = AdvanceSectionBuilder.

   Adam's locks:
   - Advance is NOT a to-do list. The progress card reads as
     "X / Y sections complete", not "Tasks done".
   - No evidence-photo capture anywhere.
   - Every existing feature carries forward (Previously Played,
     drag-drop, custom sections, save-layout, apply-template,
     copy-from-show via the sidebar dropdown).
   ============================================ */

import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { ProductShell } from '@/components/shell-v2';
import { AdvanceShowReadView } from '@/components/advance/AdvanceShowReadView';
import { AdvanceShowContextBar } from '@/components/advance/AdvanceShowContextBar';
import { AdvanceSectionBuilderDynamic } from '@/components/advance/AdvanceSectionBuilderDynamic';
import { PreviouslyPlayedButton } from '@/components/advance/PreviouslyPlayedButton';
import { AdvanceSubHeader } from '@/components/advance/AdvanceSubHeader';
import { AdvanceShowHeader } from '@/components/advance/AdvanceShowHeader';
import { AdvanceUpcomingSidebar } from '@/components/advance/AdvanceUpcomingSidebar';

/** Pull a likely artist image URL out of the freeform `branding` JSONB. */
function pickArtistImageUrl(branding: unknown): string | null {
  if (!branding || typeof branding !== 'object') return null;
  const b = branding as Record<string, unknown>;
  const candidates = [
    b.image_url,
    b.imageUrl,
    b.logo_url,
    b.logoUrl,
    b.avatar_url,
    b.avatarUrl,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c;
  }
  return null;
}

function relativeTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 30) return `${diffD}d ago`;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function formatShowDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default async function AdvanceShowPage({
  params,
  searchParams,
}: {
  params: Promise<{ tourId: string; routingId: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const { tourId, routingId } = await params;
  const { mode } = await searchParams;
  const isEdit = mode === 'edit';
  const activeTab: 'show' | 'builder' = isEdit ? 'builder' : 'show';

  const supabase = await createServerSupabaseClient();

  // Run the four reads in parallel: routing details, tour + artist,
  // advance instance (sections + last_updated bookkeeping), and form
  // config name (= "template" badge in the big-header).
  const [routingRes, tourRes, advanceRes] = await Promise.all([
    supabase
      .from('routing')
      .select('date, day_type, venue_name, city')
      .eq('id', routingId)
      .maybeSingle(),
    supabase
      .from('tours')
      .select('id, name, artist_id, artist:artists(id, name, branding)')
      .eq('id', tourId)
      .maybeSingle(),
    supabase
      .from('advance_instances')
      .select(
        'id, sections, status, last_updated_at, last_updated_by_id, form_config_id, data, section_statuses',
      )
      .eq('routing_id', routingId)
      .maybeSingle(),
  ]);

  const routing = routingRes.data as
    | {
        date: string;
        day_type: string | null;
        venue_name: string | null;
        city: string | null;
      }
    | null;
  const tourRow = tourRes.data as
    | {
        id: string;
        name: string;
        artist_id: string | null;
        artist:
          | { id: string; name: string; branding: unknown }
          | { id: string; name: string; branding: unknown }[]
          | null;
      }
    | null;

  if (!tourRow) notFound();

  const artistRow = Array.isArray(tourRow.artist)
    ? tourRow.artist[0]
    : tourRow.artist;

  // Resolve "last edited by" → display name + the form config name.
  type AdvanceRow = {
    id: string;
    sections: { template_id: string; label: string; order?: number }[] | null;
    last_updated_at: string | null;
    last_updated_by_id: string | null;
    form_config_id: string | null;
    section_statuses: Record<
      string,
      { status: string; assigned_to?: string }
    > | null;
  };
  const advance = advanceRes.data as AdvanceRow | null;

  let lastEditedBy: string | null = null;
  let templateName: string | null = null;
  if (advance) {
    const [profileRes, configRes] = await Promise.all([
      advance.last_updated_by_id
        ? supabase
            .from('profiles')
            .select('full_name, email')
            .eq('id', advance.last_updated_by_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      advance.form_config_id
        ? supabase
            .from('advance_form_configs')
            .select('name')
            .eq('id', advance.form_config_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const p = profileRes.data as
      | { full_name: string | null; email: string | null }
      | null;
    lastEditedBy =
      (p?.full_name && p.full_name.trim()) ||
      (p?.email && p.email.split('@')[0]) ||
      null;
    const c = configRes.data as { name: string | null } | null;
    templateName = c?.name?.trim() || null;
  }

  // Sections complete vs total.
  const sections = (advance?.sections ?? []) as Array<{
    template_id: string;
    label: string;
  }>;
  const sectionsTotal = sections.length;
  let sectionsComplete = 0;
  if (advance && advance.section_statuses) {
    for (const s of sections) {
      const key = s.template_id ?? s.label;
      if (advance.section_statuses[key]?.status === 'complete') {
        sectionsComplete += 1;
      }
    }
  }

  // Build the header sub-strings.
  const showName =
    routing?.venue_name ||
    routing?.city ||
    tourRow.name ||
    'Show';
  const dateLabel = formatShowDate(routing?.date);
  const contextLine = [
    [routing?.city, dateLabel].filter(Boolean).join(' · '),
  ]
    .filter(Boolean)
    .join('');

  const builderHref = `/advance/${tourId}/${routingId}?mode=edit`;
  const subHeaderLabel = `${dateLabel ?? routing?.date ?? ''}${
    routing?.venue_name ? ` · ${routing.venue_name}` : ''
  }`.trim();

  const contextBar =
    artistRow && routing ? (
      <AdvanceShowContextBar
        tourId={tourId}
        routingId={routingId}
        artist={{
          id: artistRow.id,
          name: artistRow.name ?? 'Artist',
          imageUrl: pickArtistImageUrl(artistRow.branding),
        }}
        tour={{ id: tourRow.id, name: tourRow.name ?? 'Tour' }}
        show={{
          date: routing.date,
          dayType: routing.day_type,
          venueName: routing.venue_name,
          city: routing.city,
        }}
        flush={!isEdit}
      />
    ) : null;

  return (
    <ProductShell
      active="advance"
      artistId={tourRow.artist_id ?? artistRow?.id ?? null}
      tourId={tourRow.id}
      productName="Advance"
    >
      <AdvanceSubHeader
        showLabel={subHeaderLabel || showName}
        activeTab={activeTab}
      />
      <div className="flex min-h-0 flex-1">
        <AdvanceUpcomingSidebar
          tourId={tourId}
          tourName={tourRow.name ?? 'Tour'}
          activeRoutingId={routingId}
        />
        <main className="min-w-0 flex-1 overflow-y-auto">
          {activeTab === 'builder' ? (
            <div className="mx-auto w-full max-w-[1400px] space-y-4 px-4 pb-12 pt-4">
              <AdvanceShowHeader
                showName={showName}
                contextLine={contextLine}
                templateName={templateName}
                lastEditedRelative={relativeTime(advance?.last_updated_at)}
                lastEditedBy={lastEditedBy}
                sectionsComplete={sectionsComplete}
                sectionsTotal={sectionsTotal}
                activeTab={activeTab}
                builderHref={builderHref}
              />
              {contextBar}
              <AdvanceSectionBuilderDynamic
                tourId={tourId}
                routingId={routingId}
              />
            </div>
          ) : (
            <div className="mx-auto w-full max-w-[1100px] space-y-4 px-6 py-6">
              <AdvanceShowHeader
                showName={showName}
                contextLine={contextLine}
                templateName={templateName}
                lastEditedRelative={relativeTime(advance?.last_updated_at)}
                lastEditedBy={lastEditedBy}
                sectionsComplete={sectionsComplete}
                sectionsTotal={sectionsTotal}
                activeTab={activeTab}
                builderHref={builderHref}
              />
              {contextBar}
              {/* Phase 2 §C — Previously Played affordance lives on
                  the read view (edit view has its own copy-from
                  flow inside the section builder). */}
              <div className="advance-read-no-print flex justify-end">
                <PreviouslyPlayedButton
                  tourId={tourId}
                  routingId={routingId}
                />
              </div>
              <AdvanceShowReadView tourId={tourId} routingId={routingId} />
            </div>
          )}
        </main>
      </div>
    </ProductShell>
  );
}

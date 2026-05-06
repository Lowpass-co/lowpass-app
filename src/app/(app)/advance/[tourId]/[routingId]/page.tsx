/* ============================================
   LOWPASS — Advance · Per-show page (Visual redesign §A)

   /advance/[tourId]/[routingId] — three-zone layout per Adam's
   reference HTMLs:

     <ProductShell>
       <ProductHeader>            (Phase 1 shell-v2)
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
import { TourHeader } from '@/components/shell-v2/TourHeader';
import { formatTourKeyStat } from '@/components/shell-v2/tour-key-stat';
import { resolveArtistLogoUrl } from '@/lib/artists/imageUrl';
import { AdvanceShowReadView } from '@/components/advance/AdvanceShowReadView';
import { AdvanceShowHeader } from '@/components/advance/AdvanceShowHeader';
import { AdvanceUpcomingSidebar } from '@/components/advance/AdvanceUpcomingSidebar';
import {
  AdvanceShowRightRail,
  type SpecRow,
} from '@/components/advance/AdvanceShowRightRail';
import { AdvanceBuilderShellClient } from '@/components/advance/AdvanceBuilderShellClient';
import { extractKeyContacts, type SectionDef as KeyInfoSectionDef } from '@/lib/advance/key-info';
import { computeAdvanceProgress } from '@/lib/advance/progress';

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

function isShowDateInPast(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const ms = new Date(`${iso.slice(0, 10)}T23:59:59Z`).getTime();
  if (Number.isNaN(ms)) return false;
  return ms < Date.now();
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
  const [routingRes, tourRes, advanceRes, routingCountRes] = await Promise.all([
    supabase
      .from('routing')
      .select(
        'date, day_type, venue_name, city, address, venue_website, venue_phone, venue_capacity',
      )
      .eq('id', routingId)
      .maybeSingle(),
    supabase
      .from('tours')
      .select(
        'id, name, artist_id, start_date, end_date, artist:artists(id, name, branding, spotify_id, spotify_image_url)',
      )
      .eq('id', tourId)
      .maybeSingle(),
    supabase
      .from('advance_instances')
      .select(
        'id, sections, status, last_updated_at, last_updated_by_id, form_config_id, data, section_statuses',
      )
      .eq('routing_id', routingId)
      .maybeSingle(),
    // Sprint 7 §3 — show-count for the new <TourHeader>'s
    // stats line. count: 'exact' returns the row count without
    // hauling row data.
    supabase
      .from('routing')
      .select('id', { count: 'exact', head: true })
      .eq('tour_id', tourId),
  ]);

  const routing = routingRes.data as
    | {
        date: string;
        day_type: string | null;
        venue_name: string | null;
        city: string | null;
        address: string | null;
        venue_website: string | null;
        venue_phone: string | null;
        venue_capacity: number | null;
      }
    | null;
  type ArtistInline = {
    id: string;
    name: string;
    branding: unknown;
    spotify_id: string | null;
    spotify_image_url: string | null;
  };
  const tourRow = tourRes.data as
    | {
        id: string;
        name: string;
        artist_id: string | null;
        start_date: string | null;
        end_date: string | null;
        artist: ArtistInline | ArtistInline[] | null;
      }
    | null;

  if (!tourRow) notFound();

  const artistRow = Array.isArray(tourRow.artist)
    ? tourRow.artist[0]
    : tourRow.artist;

  // Resolve "last edited by" → display name + the form config name.
  type AdvanceRow = {
    id: string;
    sections:
      | {
          template_id: string;
          label: string;
          order?: number;
          fields?: { id: string; type: string; label?: string }[];
        }[]
      | null;
    data: Record<string, Record<string, unknown>> | null;
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

  // Single source of truth for progress math — see computeAdvanceProgress.
  const sections = (advance?.sections ?? []) as Array<{
    template_id: string;
    label: string;
  }>;
  const showIsPast = isShowDateInPast(routing?.date);
  const progress = computeAdvanceProgress(
    sections,
    advance?.section_statuses ?? null,
    showIsPast,
  );
  const sectionsTotal = progress.total;
  const sectionsComplete = progress.complete;
  const overdueSectionsCount = progress.overdue;
  const pendingSectionsCount = progress.pending;

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
  const showHref = `/advance/${tourId}/${routingId}`;

  // Build the right-rail's "VENUE SPECS" rows from routing data.
  // Each entry only renders when its source column has a value, so the
  // card never shows blank rows. Tour-level / venue-level keys (curfew,
  // timezone, taxes, rigging) come from the advance.data once filled —
  // not surfaced here yet; the rail just renders specs that exist.
  const specs: SpecRow[] = [];
  if (routing?.venue_capacity != null && Number(routing.venue_capacity) > 0) {
    specs.push({
      label: 'Capacity',
      value: routing.venue_capacity.toLocaleString('en-GB'),
    });
  }
  if (routing?.address) {
    specs.push({ label: 'Address', value: routing.address });
  }
  if (routing?.venue_phone) {
    specs.push({ label: 'Phone', value: routing.venue_phone });
  }
  if (routing?.venue_website) {
    specs.push({ label: 'Website', value: routing.venue_website });
  }

  // Key contacts — extracted from filled contact fields in the advance.
  // Sections shape needs `fields` for extraction; cast safely.
  const sectionsForExtract = (advance?.sections ?? []) as KeyInfoSectionDef[];
  const advanceData = (advance?.data ?? {}) as Record<
    string,
    Record<string, unknown>
  >;
  const keyContacts = extractKeyContacts(sectionsForExtract, advanceData);

  // Section list passed to the slide-over so it can label past-show
  // sections with the current advance's labels (template_id mapping).
  const currentSectionsForRail = sectionsForExtract.map((s) => ({
    template_id: s.template_id,
    label: s.label,
  }));

  // Sprint 7 §3 — resolve artist logo for the new <TourHeader>.
  const artistLogoUrl = artistRow
    ? await resolveArtistLogoUrl(artistRow)
    : null;

  return (
    <ProductShell
      active="advance"
      artistId={tourRow.artist_id ?? artistRow?.id ?? null}
      tourId={tourRow.id}
      productName="Advance"
      currentTourKeyStat={formatTourKeyStat('advance', {
        advanceCompletePercent:
          sectionsTotal > 0
            ? (sectionsComplete / sectionsTotal) * 100
            : null,
      })}
    >
      {/* Sprint 7 §3 — <TourHeader> on every product surface. */}
      {artistRow ? (
        <TourHeader
          artistId={artistRow.id}
          artistName={artistRow.name}
          artistLogoUrl={artistLogoUrl}
          tourId={tourRow.id}
          tourName={tourRow.name}
          startDate={tourRow.start_date}
          endDate={tourRow.end_date}
          product="advance"
          stats={{
            showCount: routingCountRes.count ?? null,
            advanceCompletePercent:
              sectionsTotal > 0
                ? (sectionsComplete / sectionsTotal) * 100
                : null,
            advancePendingCount: pendingSectionsCount,
          }}
        />
      ) : null}
      {/* Hotfix 3 §3 — AdvanceSubHeader retired. The Show / Template
          Builder toggle and Duplicate / Print / Export PDF actions
          moved into TemplateMetaBar (which sits inside the inner
          <main overflow-y-auto> scroll context, so it tracks the
          canvas — the previous outer-anchored sticky drifted out
          of sync). Read mode never mounted the sub-header post-v2;
          builder mode no longer needs it either. */}
      <div className="flex min-h-0 flex-1">
        <AdvanceUpcomingSidebar
          tourId={tourId}
          tourName={tourRow.name ?? 'Tour'}
          activeRoutingId={routingId}
        />
        {activeTab === 'builder' ? (
          /* Builder mode — Variant parity §D: three-pane shell wraps
             the existing AdvanceSectionBuilder. Library / canvas /
             FieldPropertiesPanel slots replace the read-mode right
             rail in this mode. */
          <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <div
              className="shrink-0 px-4 pt-4"
              style={{ background: 'var(--lp-bg)' }}
            >
              <AdvanceShowHeader
                showName={showName}
                contextLine={contextLine}
                templateName={templateName}
                lastEditedRelative={relativeTime(advance?.last_updated_at)}
                lastEditedBy={lastEditedBy}
                sectionsComplete={sectionsComplete}
                sectionsTotal={sectionsTotal}
                pendingSectionsCount={pendingSectionsCount}
                overdueSectionsCount={overdueSectionsCount}
                activeTab={activeTab}
                builderHref={builderHref}
              />
            </div>
            <AdvanceBuilderShellClient
              tourId={tourId}
              routingId={routingId}
              templateName={templateName}
              activeTab={activeTab}
              showHref={showHref}
              builderHref={builderHref}
            />
          </main>
        ) : (
          <>
            <main className="min-w-0 flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-[1100px] space-y-4 px-6 py-6">
                <AdvanceShowHeader
                  showName={showName}
                  contextLine={contextLine}
                  templateName={templateName}
                  lastEditedRelative={relativeTime(advance?.last_updated_at)}
                  lastEditedBy={lastEditedBy}
                  sectionsComplete={sectionsComplete}
                  sectionsTotal={sectionsTotal}
                  pendingSectionsCount={pendingSectionsCount}
                  overdueSectionsCount={overdueSectionsCount}
                  activeTab={activeTab}
                  builderHref={builderHref}
                />
                <AdvanceShowReadView tourId={tourId} routingId={routingId} />
              </div>
            </main>
            {/* Read-mode right rail — Specs / Contacts / Previously Played.
                Builder mode swaps this slot for the Field Properties panel
                (rendered inside AdvanceBuilderShellClient). */}
            <AdvanceShowRightRail
              routingId={routingId}
              specs={specs}
              contacts={keyContacts}
              currentSections={currentSectionsForRail}
            />
          </>
        )}
      </div>
    </ProductShell>
  );
}

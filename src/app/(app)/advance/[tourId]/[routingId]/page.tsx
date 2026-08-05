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
import { type RoutingVenueSource } from '@/lib/venues/resolveVenue';
import { resolveAdvanceVenue, type AdvanceVenueSection } from '@/lib/advance/venue';
import { AdvanceShowReadView } from '@/components/advance/AdvanceShowReadView';
import { IntakeReviewPanel } from '@/components/advance/IntakeReviewPanel';
import { AdvanceShowHeader } from '@/components/advance/AdvanceShowHeader';
import { AdvanceUpcomingSidebar } from '@/components/advance/AdvanceUpcomingSidebar';
import { AdvanceDateStrip } from '@/components/advance/AdvanceDateStrip';
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

  // Sprint 8.1 §2 — TourHeader hoisted to the layout, so this
  // page only needs routing details + tour identity (for the
  // big show-name) + the advance instance. Show count and artist
  // are fetched in /advance/[tourId]/layout.tsx.
  const [routingRes, tourRes, advanceRes] = await Promise.all([
    supabase
      .from('routing')
      // Venue SSOT — join canonical + discriminators so the venue block resolves
      // (live day → canonical, past/frozen → snapshot). Freeze writes stay in the
      // routing GET; this render resolves only.
      .select(
        'id, date, day_type, city, country, address, venue_name, venue_website, venue_phone, venue_capacity, canonical_venue_id, venue_frozen_at, canonical:canonical_venues(id, name, address, city, country, capacity)',
      )
      .eq('id', routingId)
      .maybeSingle(),
    supabase
      .from('tours')
      .select('id, name')
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

  // Venue SSOT — resolve the venue block (live→canonical, past/frozen→snapshot).
  const routingRaw = routingRes.data as (RoutingVenueSource & { date: string; day_type: string | null }) | null;
  // Q1 — the advance's OWN edited Venue Info value wins per-field, else
  // resolveVenue(canonical). resolveAdvanceVenue keeps resolveVenue as the
  // canonical-fallback reader (guardrail intact).
  const advForVenue = advanceRes.data as {
    sections?: AdvanceVenueSection[] | null;
    data?: Record<string, Record<string, unknown>> | null;
  } | null;
  const routing = routingRaw
    ? (() => {
        const v = resolveAdvanceVenue(routingRaw, advForVenue?.sections, advForVenue?.data ?? null);
        return {
          date: routingRaw.date,
          day_type: routingRaw.day_type,
          venue_name: v.name,
          city: v.city,
          address: v.address,
          venue_website: v.website,
          venue_phone: v.phone,
          venue_capacity: v.capacity,
        };
      })()
    : null;
  const tourRow = tourRes.data as
    | { id: string; name: string }
    | null;

  if (!tourRow) notFound();

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
            // INCIDENT 2026-08-05 №2 — profiles has `name`, not `full_name`
            // (that's persons). Alias keeps the shape `p.full_name` reads.
            .select('full_name:name, email')
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

  // UX Audit 2026 — venue address for the hero sub-line (pin row).
  const addressLine = routing?.address || routing?.city || null;

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

  // A#5 — the rail Venue Specs card (routing-sourced, read-only) previously had
  // NO edit path. Deep-link it to the editable Venue Info section on the read
  // surface, identified by the section that owns a `venue_name` field (same rule
  // the venue overlay uses). Anchor slug mirrors AdvanceShowReadView's
  // sectionAnchorId(label) so the in-page scroll resolves.
  const venueSection = sectionsForExtract.find((s) =>
    ((s as { fields?: { id?: string }[] }).fields ?? []).some((f) => f.id === 'venue_name'),
  );
  const venueEditAnchor = venueSection
    ? `advance-${(venueSection.label ?? 'venue-info')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')}`
    : null;

  return (
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
                dateLabel={dateLabel}
                addressLine={addressLine}
                templateName={templateName}
                lastEditedRelative={relativeTime(advance?.last_updated_at)}
                lastEditedBy={lastEditedBy}
                sectionsComplete={sectionsComplete}
                sectionsTotal={sectionsTotal}
                pendingSectionsCount={pendingSectionsCount}
                overdueSectionsCount={overdueSectionsCount}
                activeTab={activeTab}
                builderHref={builderHref}
                tourId={tourId}
                routingId={routingId}
              />
            </div>
            {advance?.id ? (
              <div className="px-4 pt-2">
                {/* P7 Q7 — venue intake answers land PENDING; the TM reviews +
                    accepts here (mergeIntakeIntoAdvance runs at accept). */}
                <IntakeReviewPanel advanceInstanceId={advance.id} />
              </div>
            ) : null}
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
                  dateLabel={dateLabel}
                  addressLine={addressLine}
                  templateName={templateName}
                  lastEditedRelative={relativeTime(advance?.last_updated_at)}
                  lastEditedBy={lastEditedBy}
                  sectionsComplete={sectionsComplete}
                  sectionsTotal={sectionsTotal}
                  pendingSectionsCount={pendingSectionsCount}
                  overdueSectionsCount={overdueSectionsCount}
                  activeTab={activeTab}
                  builderHref={builderHref}
                  tourId={tourId}
                  routingId={routingId}
                />
                {/* Day-strip navigator — jump between the tour's show days
                    without the lg-only left sidebar. */}
                <AdvanceDateStrip tourId={tourId} activeRoutingId={routingId} />
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
              venueEditAnchor={venueEditAnchor}
            />
          </>
        )}
    </div>
  );
}

/* ============================================
   LOWPASS — Export build (#8 Document Export, Template Builder P1)

   The SINGLE place that turns (tour data + TemplateConfig) into the document HTML.
   BOTH the PDF route AND the live-preview route call this, so the preview and the
   downloaded PDF are byte-identical — WYSIWYG by construction (the only difference
   is the PDF adds the page-number footer via page.pdf, which is print-only).

   Server-only (loaders use supabase). Read-only. Generic per-surface.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { loadBudgetExportData } from '@/lib/export/budget-data';
import { buildBudgetBodyHtml } from '@/lib/export/budget-pdf';
import { loadRoomingExportData } from '@/lib/export/rooming-data';
import { buildRoomingBodyHtml } from '@/lib/export/rooming-pdf';
import { loadPayrollExportData } from '@/lib/export/payroll-data';
import { buildPayrollBodyHtml } from '@/lib/export/payroll-pdf';
import { loadRoutingExportData } from '@/lib/export/routing-data';
import { buildRoutingBodyHtml } from '@/lib/export/routing-pdf';
import { loadChannelListExportData } from '@/lib/export/channel-list-data';
import { buildChannelListBodyHtml } from '@/lib/export/channel-list-pdf';
import { loadStagePlotExportData } from '@/lib/export/stageplot-data';
import { buildStagePlotBodyHtml } from '@/lib/export/stageplot-pdf';
import { renderDocument } from '@/lib/export/shell';
import { fetchLogoDataUri, fetchExportAssetDataUri } from '@/lib/export/logo';
import type { FooterStyle, TemplateConfig } from '@/lib/export/template-config';
import { loadSettlementWalk } from '@/lib/settlement/loadWalk';
import { buildSettlementBodyHtml } from '@/lib/export/settlement-pdf';
import { loadDay } from '@/lib/day/loadDay';
import { buildDaySheetBodyHtml } from '@/lib/export/daysheet-pdf';

export interface ExportBuild {
  html: string;
  footerNote: string;
  filename: string;
  /** Phase 2 — footer styling (the route passes this to the page.pdf footer). */
  footer: FooterStyle;
  /** Part B — the reduced running header's left text, or null when the header is
   *  hidden. The route passes it to the page.pdf repeating header. */
  runningHeader: string | null;
}

function fmtDate(d: string | null): string | null {
  if (!d) return null;
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function tourDateRange(start: string | null, end: string | null): string | null {
  const s = fmtDate(start);
  const e = fmtDate(end);
  if (s && e) return `${s} – ${e}`;
  if (s) return `From ${s}`;
  if (e) return `Until ${e}`;
  return null;
}
function sanitize(s: string, fallback: string): string {
  return s.replace(/[^\w\s-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60) || fallback;
}
function nowStamp(): string {
  return new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** The letterhead logo data-URI: an uploaded header logo (config.header.logoAssetPath,
 *  private export-assets bucket) takes precedence; otherwise the artist logo. Both
 *  degrade to null (→ initials block). */
async function resolveLogo(
  supabase: SupabaseClient,
  workspaceId: string,
  config: TemplateConfig,
  artistLogoUrl: string | null | undefined,
): Promise<string | null> {
  if (config.header.logoAssetPath) {
    const uploaded = await fetchExportAssetDataUri(supabase, workspaceId, config.header.logoAssetPath);
    if (uploaded) return uploaded;
  }
  return fetchLogoDataUri(artistLogoUrl);
}

export interface BudgetTourMeta {
  id: string; name: string; currency: string | null;
  start_date: string | null; end_date: string | null; artist_id: string | null;
}

export async function buildBudgetExport(
  supabase: SupabaseClient,
  tour: BudgetTourMeta,
  workspaceId: string,
  config: TemplateConfig,
  versionId: string | null,
): Promise<ExportBuild> {
  const data = await loadBudgetExportData(supabase, tour, workspaceId, { versionId });
  const logoDataUri = config.logo ? await resolveLogo(supabase, workspaceId, config, data.logoUrl) : null;
  const bgDataUri = await fetchExportAssetDataUri(supabase, workspaceId, config.header.bgAssetPath);

  const scopeLabel = config.scope === 'projected' ? 'Projected' : config.scope === 'actual' ? 'Actual' : 'Projected vs Actual';
  const versionLabel = data.viewed ? `v${data.viewed.version_number} (${data.viewed.status})` : null;
  const subtitle = [versionLabel, scopeLabel].filter(Boolean).join(' · ');

  const html = renderDocument({
    letterhead: {
      artistName: data.artist?.name ?? null,
      tourName: data.tour.name,
      tourDates: tourDateRange(data.tour.start_date, data.tour.end_date),
      logoDataUri,
      showLogo: config.logo,
      generatedOn: nowStamp(),
    },
    pageSize: config.pageSize,
    title: 'Budget',
    subtitle,
    general: config.general,
    header: config.header,
    bgDataUri,
    bodyHtml: buildBudgetBodyHtml(data, config),
  });

  const footerNote = `${data.artist?.name ? `${data.artist.name} — ` : ''}${data.tour.name} · Budget`;
  const filename = `${sanitize(data.artist?.name ?? '', '')} — ${sanitize(data.tour.name, 'Budget')} — Budget.pdf`.replace(/^ — /, '');
  return { html, footerNote, filename, footer: config.footer, runningHeader: config.header.show ? footerNote : null };
}

/** M1-B · SET-05 — one show's settlement Walk PDF through the shared shell. */
export async function buildSettlementExport(
  supabase: SupabaseClient,
  tour: BudgetTourMeta,
  workspaceId: string,
  config: TemplateConfig,
  routingId: string,
): Promise<ExportBuild> {
  const currency = tour.currency ?? 'GBP';
  const [{ data: artist }, { data: routing }, walk] = await Promise.all([
    tour.artist_id
      ? supabase.from('artists').select('name').eq('id', tour.artist_id).maybeSingle()
      : Promise.resolve({ data: null as { name?: string } | null }),
    supabase.from('routing').select('date, city, venue_name').eq('id', routingId).maybeSingle(),
    loadSettlementWalk(supabase, routingId, workspaceId, currency),
  ]);

  const showLabel = (routing?.city as string) || (routing?.venue_name as string) || 'Show';
  const showDate = (routing?.date as string | null) ?? null;
  const artistName = (artist?.name as string | undefined) ?? null;

  const logoDataUri = config.logo ? await resolveLogo(supabase, workspaceId, config, null) : null;
  const bgDataUri = await fetchExportAssetDataUri(supabase, workspaceId, config.header.bgAssetPath);

  const html = renderDocument({
    letterhead: {
      artistName,
      tourName: tour.name,
      tourDates: tourDateRange(tour.start_date, tour.end_date),
      logoDataUri,
      showLogo: config.logo,
      generatedOn: nowStamp(),
    },
    pageSize: config.pageSize,
    title: 'Settlement',
    subtitle: [showLabel, showDate].filter(Boolean).join(' · '),
    general: config.general,
    header: config.header,
    bgDataUri,
    bodyHtml: buildSettlementBodyHtml(walk, { showLabel, date: showDate }, config),
  });

  const footerNote = `${artistName ? `${artistName} — ` : ''}${tour.name} · Settlement · ${showLabel}`;
  const filename = `${sanitize(artistName ?? '', '')} — ${sanitize(showLabel, 'Show')} — Settlement.pdf`.replace(/^ — /, '');
  return { html, footerNote, filename, footer: config.footer, runningHeader: config.header.show ? footerNote : null };
}

/** D1-2 · DAY-03 — one routing row's Day Sheet PDF through the shared shell. The
 *  day is loaded with the full (tm) slice; the audience TEMPLATE (config.sections
 *  + daysheet.bigType) decides which sections print. Money never prints. */
export async function buildDaySheetExport(
  supabase: SupabaseClient,
  tour: BudgetTourMeta,
  workspaceId: string,
  config: TemplateConfig,
  routingId: string,
): Promise<ExportBuild> {
  const day = await loadDay(supabase, {
    tourId: tour.id,
    routingId,
    workspaceId,
    role: 'tm',
    tourCurrency: tour.currency,
  });
  if (!day) throw new Error('Day not found');

  const logoDataUri = config.logo ? await resolveLogo(supabase, workspaceId, config, null) : null;
  const bgDataUri = await fetchExportAssetDataUri(supabase, workspaceId, config.header.bgAssetPath);

  const showLabel = [day.city, day.venue?.name].filter(Boolean).join(' · ') || 'Day';
  const templateLabel = config.daysheet?.template && config.daysheet.template !== 'standard'
    ? config.daysheet.template.charAt(0).toUpperCase() + config.daysheet.template.slice(1)
    : null;

  const html = renderDocument({
    letterhead: {
      artistName: day.artistName,
      tourName: day.tourName ?? tour.name,
      tourDates: tourDateRange(tour.start_date, tour.end_date),
      logoDataUri,
      showLogo: config.logo,
      generatedOn: nowStamp(),
    },
    pageSize: config.pageSize,
    title: 'Day Sheet',
    subtitle: [fmtDate(day.date), showLabel, templateLabel].filter(Boolean).join(' · '),
    general: config.general,
    header: config.header,
    bgDataUri,
    bodyHtml: buildDaySheetBodyHtml(day, config),
  });

  const footerNote = `${day.artistName ? `${day.artistName} — ` : ''}${day.tourName ?? tour.name} · Day Sheet · ${showLabel}`;
  const filename = `${sanitize(day.artistName ?? '', '')} — ${sanitize(showLabel, 'Day')} — Day Sheet.pdf`.replace(/^ — /, '');
  return { html, footerNote, filename, footer: config.footer, runningHeader: config.header.show ? footerNote : null };
}

export interface RoomingTourMeta {
  id: string; name: string;
  start_date: string | null; end_date: string | null; artist_id: string | null;
}

export async function buildRoomingExport(
  supabase: SupabaseClient,
  tour: RoomingTourMeta,
  workspaceId: string,
  config: TemplateConfig,
): Promise<ExportBuild> {
  const data = await loadRoomingExportData(supabase, tour, workspaceId, { range: config.dateRange });
  const logoDataUri = config.logo ? await resolveLogo(supabase, workspaceId, config, data.logoUrl) : null;
  const bgDataUri = await fetchExportAssetDataUri(supabase, workspaceId, config.header.bgAssetPath);

  const rangeLabel = config.dateRange.from || config.dateRange.to ? tourDateRange(config.dateRange.from, config.dateRange.to) : null;
  const subtitle = [`${data.hotels.length} hotel${data.hotels.length === 1 ? '' : 's'}`, rangeLabel].filter(Boolean).join(' · ');

  const html = renderDocument({
    letterhead: {
      artistName: data.artist?.name ?? null,
      tourName: data.tour.name,
      tourDates: tourDateRange(data.tour.start_date, data.tour.end_date),
      logoDataUri,
      showLogo: config.logo,
      generatedOn: nowStamp(),
    },
    pageSize: config.pageSize,
    title: 'Rooming list',
    subtitle,
    general: config.general,
    header: config.header,
    bgDataUri,
    bodyHtml: buildRoomingBodyHtml(data, config),
  });

  const footerNote = `${data.artist?.name ? `${data.artist.name} — ` : ''}${data.tour.name} · Rooming`;
  const filename = `${sanitize(data.artist?.name ?? '', '')} — ${sanitize(data.tour.name, 'Rooming')} — Rooming.pdf`.replace(/^ — /, '');
  return { html, footerNote, filename, footer: config.footer, runningHeader: config.header.show ? footerNote : null };
}

export interface PayrollTourMeta {
  id: string; name: string; currency: string | null;
  start_date: string | null; end_date: string | null; artist_id: string | null;
}

export async function buildPayrollExport(
  supabase: SupabaseClient,
  tour: PayrollTourMeta,
  workspaceId: string,
  config: TemplateConfig,
): Promise<ExportBuild> {
  const data = await loadPayrollExportData(supabase, tour, workspaceId, {
    range: config.dateRange,
    personId: config.payroll.mode === 'individual' ? config.payroll.personId : null,
    selectedIds: config.payroll.selectedPersonIds,
    venuePerDay: config.payroll.venuePerDay,
  });
  const logoDataUri = config.logo ? await resolveLogo(supabase, workspaceId, config, data.logoUrl) : null;
  const bgDataUri = await fetchExportAssetDataUri(supabase, workspaceId, config.header.bgAssetPath);

  const modeLabel = config.payroll.mode === 'individual' ? 'Individual statements' : null;
  const rangeLabel = config.dateRange.from || config.dateRange.to ? tourDateRange(config.dateRange.from, config.dateRange.to) : null;
  const subtitle = [`${data.persons.length} crew · ${data.currency}`, modeLabel, rangeLabel].filter(Boolean).join(' · ');

  const html = renderDocument({
    letterhead: {
      artistName: data.artist?.name ?? null,
      tourName: data.tour.name,
      tourDates: tourDateRange(data.tour.start_date, data.tour.end_date),
      logoDataUri,
      showLogo: config.logo,
      generatedOn: nowStamp(),
    },
    pageSize: config.pageSize,
    title: 'Payroll',
    subtitle,
    general: config.general,
    header: config.header,
    bgDataUri,
    bodyHtml: buildPayrollBodyHtml(data, config),
  });

  const footerNote = `${data.artist?.name ? `${data.artist.name} — ` : ''}${data.tour.name} · Payroll`;
  const filename = `${sanitize(data.artist?.name ?? '', '')} — ${sanitize(data.tour.name, 'Payroll')} — Payroll.pdf`.replace(/^ — /, '');
  return { html, footerNote, filename, footer: config.footer, runningHeader: config.header.show ? footerNote : null };
}

export interface RoutingTourMeta {
  id: string; name: string;
  start_date: string | null; end_date: string | null; artist_id: string | null;
}

export async function buildRoutingExport(
  supabase: SupabaseClient,
  tour: RoutingTourMeta,
  workspaceId: string,
  config: TemplateConfig,
): Promise<ExportBuild> {
  const data = await loadRoutingExportData(supabase, tour, { range: config.dateRange, travelTimes: config.routing.travelTimes });
  const logoDataUri = config.logo ? await resolveLogo(supabase, workspaceId, config, data.logoUrl) : null;
  const bgDataUri = await fetchExportAssetDataUri(supabase, workspaceId, config.header.bgAssetPath);

  const viewLabel = config.routing.view === 'calendar' ? 'Calendar' : null;
  const rangeLabel = config.dateRange.from || config.dateRange.to ? tourDateRange(config.dateRange.from, config.dateRange.to) : null;
  const subtitle = [`${data.days.length} day${data.days.length === 1 ? '' : 's'}`, viewLabel, rangeLabel].filter(Boolean).join(' · ');

  const html = renderDocument({
    letterhead: {
      artistName: data.artist?.name ?? null,
      tourName: data.tour.name,
      tourDates: tourDateRange(data.tour.start_date, data.tour.end_date),
      logoDataUri,
      showLogo: config.logo,
      generatedOn: nowStamp(),
    },
    pageSize: config.pageSize,
    title: 'Routing',
    subtitle,
    general: config.general,
    header: config.header,
    bgDataUri,
    bodyHtml: buildRoutingBodyHtml(data, config),
  });

  const footerNote = `${data.artist?.name ? `${data.artist.name} — ` : ''}${data.tour.name} · Routing`;
  const filename = `${sanitize(data.artist?.name ?? '', '')} — ${sanitize(data.tour.name, 'Routing')} — Routing.pdf`.replace(/^ — /, '');
  return { html, footerNote, filename, footer: config.footer, runningHeader: config.header.show ? footerNote : null };
}

export interface ChannelListTourMeta {
  id: string; name: string; artist_id: string | null;
}

export async function buildChannelListExport(
  supabase: SupabaseClient,
  tour: ChannelListTourMeta,
  workspaceId: string,
  config: TemplateConfig,
): Promise<ExportBuild> {
  const data = await loadChannelListExportData(supabase, tour);
  const logoDataUri = config.logo ? await resolveLogo(supabase, workspaceId, config, data.logoUrl) : null;
  const bgDataUri = await fetchExportAssetDataUri(supabase, workspaceId, config.header.bgAssetPath);

  const subtitle = `${data.inputs.length} channel${data.inputs.length === 1 ? '' : 's'}${data.outputs.length ? ` · ${data.outputs.length} output${data.outputs.length === 1 ? '' : 's'}` : ''}`;

  const html = renderDocument({
    letterhead: {
      artistName: data.artist?.name ?? null,
      tourName: data.tour.name,
      tourDates: null,
      logoDataUri,
      showLogo: config.logo,
      generatedOn: nowStamp(),
    },
    pageSize: config.pageSize,
    title: 'Channel list',
    subtitle,
    general: config.general,
    header: config.header,
    bgDataUri,
    bodyHtml: buildChannelListBodyHtml(data, config),
  });

  const footerNote = `${data.artist?.name ? `${data.artist.name} — ` : ''}${data.tour.name} · Channel list`;
  const filename = `${sanitize(data.artist?.name ?? '', '')} — ${sanitize(data.tour.name, 'Channel list')} — Channel list.pdf`.replace(/^ — /, '');
  return { html, footerNote, filename, footer: config.footer, runningHeader: config.header.show ? footerNote : null };
}

/** Stage plot — plot-id based (not tour-id; a plot lives in the artist library /
 *  a rider pack). The "include input list" toggle IS the `input-list` section's
 *  visibility, so we only resolve the paired channel list when that section is on. */
export async function buildStagePlotExport(
  supabase: SupabaseClient,
  plotId: string,
  workspaceId: string,
  config: TemplateConfig,
): Promise<ExportBuild> {
  const includeInputList = config.sections.some((s) => s.id === 'input-list' && s.show);
  const data = await loadStagePlotExportData(supabase, plotId, workspaceId, { includeInputList });
  if (!data) throw new Error('stage-plot-not-found');
  const logoDataUri = config.logo ? await resolveLogo(supabase, workspaceId, config, data.logoUrl) : null;
  const bgDataUri = await fetchExportAssetDataUri(supabase, workspaceId, config.header.bgAssetPath);

  const subtitle = [`${data.plot.widthFt}′ × ${data.plot.depthFt}′`, includeInputList ? 'with input list' : null].filter(Boolean).join(' · ');

  const html = renderDocument({
    letterhead: {
      artistName: data.artist?.name ?? null,
      tourName: data.plotName,
      tourDates: null,
      logoDataUri,
      showLogo: config.logo,
      generatedOn: nowStamp(),
    },
    pageSize: config.pageSize,
    title: 'Stage plot',
    subtitle,
    general: config.general,
    header: config.header,
    bgDataUri,
    bodyHtml: buildStagePlotBodyHtml(data, config),
  });

  const footerNote = `${data.artist?.name ? `${data.artist.name} — ` : ''}${data.plotName} · Stage plot`;
  const filename = `${sanitize(data.artist?.name ?? '', '')} — ${sanitize(data.plotName, 'Stage plot')} — Stage plot.pdf`.replace(/^ — /, '');
  return { html, footerNote, filename, footer: config.footer, runningHeader: config.header.show ? footerNote : null };
}

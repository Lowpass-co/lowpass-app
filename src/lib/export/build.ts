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
import { renderDocument } from '@/lib/export/shell';
import { fetchLogoDataUri, fetchExportAssetDataUri } from '@/lib/export/logo';
import type { FooterStyle, TemplateConfig } from '@/lib/export/template-config';

export interface ExportBuild {
  html: string;
  footerNote: string;
  filename: string;
  /** Phase 2 — footer styling (the route passes this to the page.pdf footer). */
  footer: FooterStyle;
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
  return { html, footerNote, filename, footer: config.footer };
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
  const data = await loadRoomingExportData(supabase, tour, workspaceId);
  const logoDataUri = config.logo ? await resolveLogo(supabase, workspaceId, config, data.logoUrl) : null;
  const bgDataUri = await fetchExportAssetDataUri(supabase, workspaceId, config.header.bgAssetPath);

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
    subtitle: `${data.hotels.length} hotel${data.hotels.length === 1 ? '' : 's'}`,
    general: config.general,
    header: config.header,
    bgDataUri,
    bodyHtml: buildRoomingBodyHtml(data, config),
  });

  const footerNote = `${data.artist?.name ? `${data.artist.name} — ` : ''}${data.tour.name} · Rooming`;
  const filename = `${sanitize(data.artist?.name ?? '', '')} — ${sanitize(data.tour.name, 'Rooming')} — Rooming.pdf`.replace(/^ — /, '');
  return { html, footerNote, filename, footer: config.footer };
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
  const data = await loadPayrollExportData(supabase, tour, workspaceId);
  const logoDataUri = config.logo ? await resolveLogo(supabase, workspaceId, config, data.logoUrl) : null;
  const bgDataUri = await fetchExportAssetDataUri(supabase, workspaceId, config.header.bgAssetPath);

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
    subtitle: `${data.persons.length} crew · ${data.currency}`,
    general: config.general,
    header: config.header,
    bgDataUri,
    bodyHtml: buildPayrollBodyHtml(data, config),
  });

  const footerNote = `${data.artist?.name ? `${data.artist.name} — ` : ''}${data.tour.name} · Payroll`;
  const filename = `${sanitize(data.artist?.name ?? '', '')} — ${sanitize(data.tour.name, 'Payroll')} — Payroll.pdf`.replace(/^ — /, '');
  return { html, footerNote, filename, footer: config.footer };
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
  const data = await loadRoutingExportData(supabase, tour);
  const logoDataUri = config.logo ? await resolveLogo(supabase, workspaceId, config, data.logoUrl) : null;
  const bgDataUri = await fetchExportAssetDataUri(supabase, workspaceId, config.header.bgAssetPath);

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
    subtitle: `${data.days.length} day${data.days.length === 1 ? '' : 's'}`,
    general: config.general,
    header: config.header,
    bgDataUri,
    bodyHtml: buildRoutingBodyHtml(data, config),
  });

  const footerNote = `${data.artist?.name ? `${data.artist.name} — ` : ''}${data.tour.name} · Routing`;
  const filename = `${sanitize(data.artist?.name ?? '', '')} — ${sanitize(data.tour.name, 'Routing')} — Routing.pdf`.replace(/^ — /, '');
  return { html, footerNote, filename, footer: config.footer };
}

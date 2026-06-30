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
import { renderDocument } from '@/lib/export/shell';
import { fetchLogoDataUri } from '@/lib/export/logo';
import type { TemplateConfig } from '@/lib/export/template-config';

export interface ExportBuild {
  html: string;
  footerNote: string;
  filename: string;
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
  const logoDataUri = config.logo ? await fetchLogoDataUri(data.logoUrl) : null;

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
    bodyHtml: buildBudgetBodyHtml(data, config),
  });

  const footerNote = `${data.artist?.name ? `${data.artist.name} — ` : ''}${data.tour.name} · Budget`;
  const filename = `${sanitize(data.artist?.name ?? '', '')} — ${sanitize(data.tour.name, 'Budget')} — Budget.pdf`.replace(/^ — /, '');
  return { html, footerNote, filename };
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
  const logoDataUri = config.logo ? await fetchLogoDataUri(data.logoUrl) : null;

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
    bodyHtml: buildRoomingBodyHtml(data, config),
  });

  const footerNote = `${data.artist?.name ? `${data.artist.name} — ` : ''}${data.tour.name} · Rooming`;
  const filename = `${sanitize(data.artist?.name ?? '', '')} — ${sanitize(data.tour.name, 'Rooming')} — Rooming.pdf`.replace(/^ — /, '');
  return { html, footerNote, filename };
}

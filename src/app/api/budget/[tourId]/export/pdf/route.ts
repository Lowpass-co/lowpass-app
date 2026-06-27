/* ============================================
   LOWPASS — POST /api/budget/[tourId]/export/pdf  (#8 Document Export)

   Streams a branded A4 Budget PDF. READ-ONLY: loads the tour's budget (workspace-
   RLS scoped — a foreign-workspace tour 404s, no cross-workspace leak), renders
   the shared shell + budget body, and prints via the existing puppeteer pipeline
   (getBrowser() — reused, not re-implemented). Never writes.

   Query: ?scope=projected|actual|both (default both) · ?version=<id> (the viewed
   version's proposed overlay; defaults to the page's landing version).
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { loadBudgetExportData } from '@/lib/export/budget-data';
import { buildBudgetBodyHtml, type ExportScope } from '@/lib/export/budget-pdf';
import { renderDocument, PAGE_PDF_OPTIONS, PDF_HEADER_TEMPLATE, pdfFooterTemplate } from '@/lib/export/shell';
import { fetchLogoDataUri, lowpassMarkDataUri } from '@/lib/export/logo';
import { getBrowser, closePage } from '@/lib/rider-packs/puppeteer';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SCOPES: ExportScope[] = ['projected', 'actual', 'both'];

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
const sanitize = (s: string): string => s.replace(/[^\w\s-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Budget';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tourId: string }> },
): Promise<NextResponse | Response> {
  const { tourId } = await params;
  const url = new URL(request.url);
  const scopeParam = url.searchParams.get('scope');
  const scope: ExportScope = SCOPES.includes(scopeParam as ExportScope) ? (scopeParam as ExportScope) : 'both';
  const versionId = url.searchParams.get('version');

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', user.id).single();
  if (!profile?.workspace_id) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  // Workspace-RLS scope: a tour outside the user's workspace 404s (no leak).
  const { data: tour } = await supabase
    .from('tours')
    .select('id, name, currency, artist_id, start_date, end_date, workspace_id')
    .eq('id', tourId)
    .eq('workspace_id', profile.workspace_id)
    .maybeSingle();
  if (!tour) return NextResponse.json({ error: 'Tour not found' }, { status: 404 });

  const data = await loadBudgetExportData(
    supabase,
    { id: tour.id as string, name: (tour.name as string) || 'Tour', currency: tour.currency as string | null, start_date: tour.start_date as string | null, end_date: tour.end_date as string | null, artist_id: tour.artist_id as string | null },
    profile.workspace_id as string,
    { versionId },
  );

  const [logoDataUri, markDataUri] = await Promise.all([fetchLogoDataUri(data.logoUrl), lowpassMarkDataUri()]);

  const scopeLabel = scope === 'projected' ? 'Projected' : scope === 'actual' ? 'Actual' : 'Projected vs Actual';
  const versionLabel = data.viewed ? `v${data.viewed.version_number} (${data.viewed.status})` : null;
  const subtitle = [versionLabel, scopeLabel].filter(Boolean).join(' · ');

  const bodyHtml = buildBudgetBodyHtml(data, { scope });
  const html = renderDocument({
    letterhead: {
      artistName: data.artist?.name ?? null,
      tourName: data.tour.name,
      tourDates: tourDateRange(data.tour.start_date, data.tour.end_date),
      logoDataUri,
      generatedOn: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    },
    title: 'Budget',
    subtitle,
    bodyHtml,
  });

  const footerNote = `${data.artist?.name ? `${data.artist.name} — ` : ''}${data.tour.name} · Budget`;
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'load', timeout: 20_000 });
    const buffer = await page.pdf({
      ...PAGE_PDF_OPTIONS,
      headerTemplate: PDF_HEADER_TEMPLATE,
      footerTemplate: pdfFooterTemplate(footerNote, markDataUri),
    });
    const filename = `${sanitize(data.artist?.name ?? '')} — ${sanitize(data.tour.name)} — Budget.pdf`.replace(/^ — /, '');
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } finally {
    await closePage(page);
  }
}

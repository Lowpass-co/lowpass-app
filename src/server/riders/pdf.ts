/* ============================================
   LOWPASS — Riders: the PDF (rebuild, Nov 2026; redressed Nov 2026)

   The reference copy: the published version's documents (Tech, then
   Hospitality), each opening on its own cover — the artist's logo, title,
   tour, version stamp, opening statement, contents — then the body with the
   logo at the head of every page and "Page x of y · Version 1.7 · Updated
   26 Nov 2026" at the foot (Adam: "a refined version of my rider with logo").
   Filtered to a show's date when it's a show's PDF (with that show's settled
   lines), then what changed. Built from the same model as the page
   (lib/riders/render.ts) and rendered by the shared export pipeline
   (puppeteer, lib/export/render.ts) with its own page furniture.
   ============================================ */

import { createServiceSupabaseClient } from '@/lib/supabase-server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { documentFontCss } from '@/lib/export/fonts';
import type { ExportDoc } from '@/lib/export/render';
import { fmtDay } from '@/lib/riders/blocks';
import { docModel, riderFooterTemplate, riderPdfHtml, type LineStateView } from '@/lib/riders/render';
import type { RiderChange, RiderKind, RiderSnapshot } from '@/lib/riders/types';
import { loadRiderLogo } from './logo';

/** "Version 1.7 · Updated 26 Nov 2026" — the stamp on the cover and every page. */
export function versionStamp(version: { label: string; publishedAt: string } | null): string {
  return version ? `Version ${version.label} · Updated ${fmtDay(version.publishedAt.slice(0, 10), true)}` : 'Draft — not published';
}

export async function riderPdfDoc(input: {
  /** The tour (its artist's logo heads the PDF). */
  tourId: string;
  snapshot: RiderSnapshot;
  version: { label: string; publishedAt: string } | null;
  show: { date: string; venue: string | null; city: string | null; routingId?: string | null } | null;
  states?: Record<string, LineStateView>;
  changes: RiderChange[];
  linkUrl: string | null;
  kinds?: RiderKind[];
}): Promise<ExportDoc> {
  const { snapshot: s } = input;
  const docs = input.kinds?.length ? s.docs.filter((d) => input.kinds!.includes(d.kind)) : s.docs;
  const ctx = { date: input.show?.date ?? null, party: s.party, docs: s.docs, attachments: s.attachments, states: input.states, embeds: s.embeds, routingId: input.show?.routingId ?? null };
  const models = docs.map((d) => docModel(d, ctx));
  const stamp = versionStamp(input.version);
  const where = input.show ? [input.show.venue, input.show.city].filter(Boolean).join(', ') : '';
  const showText = input.show ? `For ${where || 'the show'} · ${fmtDay(input.show.date, true)}` : null;
  const who = [s.artistName, s.tourName].filter(Boolean).join(' — ');
  const v = input.version ? `v${input.version.label}` : 'draft';
  const [logo, fontCss] = await Promise.all([loadRiderLogo(createServiceSupabaseClient() as unknown as SupabaseClient, input.tourId), documentFontCss()]);
  const print = {
    title: `${who} rider ${v}`,
    header: { artist: s.artistName, version: stamp, show: showText },
    tourName: s.tourName,
    models,
    changes: input.changes,
    linkUrl: input.linkUrl,
    logo,
    fontCss,
  };
  const html = riderPdfHtml(print);
  const fileWhere = input.show ? ` — ${where ? `${where} ` : ''}${input.show.date}` : '';
  return {
    html,
    footerNote: `${who} · Rider ${v}`,
    markDataUri: null,
    filename: `${who || 'Rider'} — Rider ${v}${fileWhere}.pdf`.replace(/[\\/:*?"<>|]+/g, '-'),
    page: {
      headerTemplate: '<span></span>',
      footerTemplate: riderFooterTemplate(stamp),
      margin: { top: '14mm', right: '18mm', bottom: '18mm', left: '18mm' },
      // Printed riders get read on paper: the contents says which page.
      withPageNumbers: (pageOf) => riderPdfHtml({ ...print, pageOf }),
    },
  };
}

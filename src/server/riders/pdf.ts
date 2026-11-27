/* ============================================
   LOWPASS — Riders: the PDF (rebuild, Nov 2026)

   The reference copy: the published version's documents (Tech, then
   Hospitality, each on its own pages), stamped "Version 1.7 · 26 Nov 2026"
   in the header and the running footer, filtered to a show's date when it's
   a show's PDF (with that show's settled lines), then what changed. Built
   from the same model as the page (lib/riders/render.ts) and rendered by the
   shared export pipeline (puppeteer, lib/export/render.ts).
   ============================================ */

import { lowpassMarkDataUri } from '@/lib/export/logo';
import type { ExportDoc } from '@/lib/export/render';
import { fmtDay } from '@/lib/riders/blocks';
import { docModel, riderPdfHtml, versionLine, type LineStateView } from '@/lib/riders/render';
import type { RiderChange, RiderKind, RiderSnapshot } from '@/lib/riders/types';

export async function riderPdfDoc(input: {
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
  const versionText = input.version ? versionLine(input.version.label, input.version.publishedAt) : versionLine('', null);
  const where = input.show ? [input.show.venue, input.show.city].filter(Boolean).join(', ') : '';
  const showText = input.show ? `For ${where || 'the show'} — ${fmtDay(input.show.date, true)}` : null;
  const who = [s.artistName, s.tourName].filter(Boolean).join(' — ');
  const v = input.version ? `v${input.version.label}` : 'draft';
  const html = riderPdfHtml({
    title: `${who} rider ${v}`,
    header: { artist: s.artistName, version: versionText, show: showText },
    models,
    changes: input.changes,
    linkUrl: input.linkUrl,
  });
  const fileWhere = input.show ? ` — ${where ? `${where} ` : ''}${input.show.date}` : '';
  return {
    html,
    footerNote: `${who} · Rider ${v}`,
    markDataUri: await lowpassMarkDataUri(),
    filename: `${who || 'Rider'} — Rider ${v}${fileWhere}.pdf`.replace(/[\\/:*?"<>|]+/g, '-'),
    runningHeader: `${who} · Rider ${v}`,
  };
}

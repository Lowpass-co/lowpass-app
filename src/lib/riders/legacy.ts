/* ============================================
   LOWPASS — Riders: bring over the old builder's riders — pure

   Adam: "Move them over, delete old". An old rider pack (rider_packs kind
   'rider' + rider_sections) becomes blocks:
     section            → a section heading
     rich text          → prose (through cleanDoc — variables and other
                          custom nodes keep their words)
     advance summary    → a two-column table (it was typed, not built)
     channel list       → the attachments block
     fields: text → prose · table → table · contacts → contacts ·
             checklist → request lines · time / money / number / link →
             a "Label: value" paragraph · image → a note to re-attach it
   A show-scoped pack's blocks apply on that show's date only.
   Nothing is deleted: the old rows stay where they are.
   ============================================ */

import { cleanDoc, docFromText } from './prose';
import type { TemplateBlock } from './starters';
import type { Contact, RiderKind } from './types';

export interface LegacyPack {
  id: string;
  title: string | null;
  scope: string | null;
  cover_disclaimer?: string | null;
}
export interface LegacySection {
  title: string | null;
  sort_order: number | null;
  section_type?: string | null;
  fields?: unknown;
  metadata?: unknown;
}

const s = (v: unknown): string => (typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v));

/** HTML or markdown-ish field text → plain lines. */
export function htmlToText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function legacyKind(title: string | null): RiderKind {
  return /hosp|catering|food|backstage/i.test(title ?? '') ? 'hospitality' : 'tech';
}

function fieldBlocks(raw: unknown, sectionTitle: string): TemplateBlock[] {
  const out: TemplateBlock[] = [];
  for (const f of Array.isArray(raw) ? raw : []) {
    const x = (f && typeof f === 'object' ? f : {}) as Record<string, unknown>;
    const label = s(x.label).trim();
    const labelled = (value: string) => (label && label.toLowerCase() !== sectionTitle.toLowerCase() ? `${label}: ${value}` : value);
    switch (x.type) {
      case 'text': {
        const text = htmlToText(s(x.value));
        if (!text) break;
        if (label && label.toLowerCase() !== sectionTitle.toLowerCase()) out.push({ kind: 'heading', content: { text: label.slice(0, 200), level: 2 } });
        out.push({ kind: 'text', content: { doc: docFromText(text) } });
        break;
      }
      case 'table': {
        const cols = (Array.isArray(x.columns) ? x.columns : []) as { key?: unknown; label?: unknown }[];
        const rows = (Array.isArray(x.rows) ? x.rows : []) as Record<string, unknown>[];
        if (!cols.length) break;
        if (label) out.push({ kind: 'heading', content: { text: label.slice(0, 200), level: 2 } });
        out.push({
          kind: 'table',
          content: { columns: cols.slice(0, 8).map((c) => s(c.label).slice(0, 60)), rows: rows.slice(0, 200).map((r) => cols.slice(0, 8).map((c) => s(r?.[s(c.key)]).slice(0, 400))) },
        });
        break;
      }
      case 'contact': {
        const people: Contact[] = ((Array.isArray(x.entries) ? x.entries : []) as Record<string, unknown>[])
          .map((e) => ({ name: s(e.name).slice(0, 120), role: s(e.role).slice(0, 120), phone: s(e.phone).slice(0, 60), email: s(e.email).slice(0, 200), personId: null }))
          .filter((p) => p.name || p.email || p.phone);
        if (people.length) out.push({ kind: 'contacts', content: { people } });
        break;
      }
      case 'checkbox_list':
        for (const it of (Array.isArray(x.items) ? x.items : []) as Record<string, unknown>[]) {
          const item = s(it.label).trim();
          if (item) out.push({ kind: 'request', content: { qty: null, item: item.slice(0, 300), provider: 'venue', alternatives: '', note: '', optional: false, perPerson: false, summary: false } });
        }
        break;
      case 'time':
        if (s(x.value)) out.push({ kind: 'text', content: { doc: docFromText(labelled(s(x.value))) } });
        break;
      case 'currency':
        if (x.amount !== undefined && x.amount !== null) out.push({ kind: 'text', content: { doc: docFromText(labelled(`${s(x.amount)} ${s(x.currency)}`.trim())) } });
        break;
      case 'number':
        if (x.value !== undefined && x.value !== null) out.push({ kind: 'text', content: { doc: docFromText(labelled(`${s(x.value)}${x.unit ? ` ${s(x.unit)}` : ''}`)) } });
        break;
      case 'url': {
        const href = s(x.href).trim();
        if (!href) break;
        const text = s(x.display_text).trim() || href;
        const doc = cleanDoc({
          type: 'doc',
          content: [{ type: 'paragraph', content: [...(label ? [{ type: 'text', text: `${label}: ` }] : []), { type: 'text', text, marks: [{ type: 'link', attrs: { href } }] }] }],
        });
        out.push({ kind: 'text', content: { doc } });
        break;
      }
      case 'asset':
        out.push({ kind: 'text', content: { doc: docFromText(`${label || 'Image'} — re-attach it in Attachments.`) } });
        break;
    }
  }
  return out;
}

/** One old pack → template blocks (+ which document they belong in). */
export function convertLegacyPack(pack: LegacyPack, sections: readonly LegacySection[], showDate: string | null = null): { kind: RiderKind; blocks: TemplateBlock[] } {
  const blocks: TemplateBlock[] = [];
  const disclaimer = htmlToText(s(pack.cover_disclaimer));
  if (disclaimer) blocks.push({ kind: 'text', content: { doc: docFromText(disclaimer) } });
  const ordered = [...sections].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  for (const sec of ordered) {
    const title = s(sec.title).trim() || 'Section';
    const meta = (sec.metadata && typeof sec.metadata === 'object' ? sec.metadata : {}) as Record<string, unknown>;
    const body: TemplateBlock[] = [];
    switch (sec.section_type ?? 'fields') {
      case 'rich_text':
        if (meta.content) body.push({ kind: 'text', content: { doc: cleanDoc(meta.content) } });
        break;
      case 'advance_summary': {
        const rows = ((Array.isArray(meta.summary) ? meta.summary : []) as Record<string, unknown>[])
          .map((r) => [s(r.subject).slice(0, 400), htmlToText(s(r.body)).slice(0, 400)])
          .filter((r) => r[0] || r[1]);
        if (rows.length) body.push({ kind: 'table', content: { columns: ['Item', 'Detail'], rows } });
        break;
      }
      case 'channel_list':
        body.push({ kind: 'files', content: { items: [{ kind: 'channel_list' }] } });
        break;
      default:
        body.push(...fieldBlocks(sec.fields, title));
    }
    if (!body.length) continue;
    blocks.push({ kind: 'heading', content: { text: title.slice(0, 200), level: 1 } }, ...body);
  }
  if (showDate) {
    for (const b of blocks) {
      b.from = showDate;
      b.until = showDate;
    }
  }
  return { kind: legacyKind(pack.title), blocks };
}

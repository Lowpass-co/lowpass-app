/* ============================================
   LOWPASS — Rider/Pack -> Google Doc converter

   Converts a ResolvedPack into Docs API
   batchUpdate requests. Caller is responsible
   for actually creating/updating the doc.

   v1 output:
     H1: pack title + artist
     H2: each section title
     H3: each field label
     Para: field value

   Skipped in v1 (explicit placeholders):
     - Images: rendered as "[Image: <label>]"
     - Tables: rendered as tab-separated plain text
     - Rich formatting: none
   ============================================ */

import type {
  Field,
  FieldCheckboxList,
  FieldContact,
  FieldCurrency,
  FieldNumber,
  FieldTable,
  FieldText,
  FieldTime,
  FieldUrl,
  ResolvedPack,
} from '@/lib/rider-packs/types';
import type { docs_v1 } from 'googleapis';

type StyleKind = 'HEADING_1' | 'HEADING_2' | 'HEADING_3';

type StyleRange = {
  startIndex: number;
  endIndex: number;
  namedStyleType: StyleKind;
};

export type ExportBuild = {
  title: string;
  body: string;
  styleRanges: StyleRange[];
};

export function buildExport(
  pack: ResolvedPack['pack'] & { artist_name: string },
  sections: ResolvedPack['sections'],
): ExportBuild {
  const title = (pack.title?.trim() || 'Rider') + ` — ${pack.artist_name}`.trimEnd();
  const styleRanges: StyleRange[] = [];
  const parts: string[] = [];
  let cursor = 1;

  const push = (text: string, heading?: StyleKind) => {
    if (heading) {
      styleRanges.push({
        startIndex: cursor,
        endIndex: cursor + text.length,
        namedStyleType: heading,
      });
    }
    parts.push(text);
    cursor += text.length;
  };

  push(`${title}\n`, 'HEADING_1');
  push('\n');

  const ordered = [...sections].sort((a, b) => a.sort_order - b.sort_order);
  for (const section of ordered) {
    push(`${section.title}\n`, 'HEADING_2');

    const fields = (section.fields ?? []) as Field[];
    if (fields.length === 0) {
      push('(empty)\n\n');
      continue;
    }

    for (const field of fields) {
      const label = field.label?.trim() || '';
      if (label) push(`${label}\n`, 'HEADING_3');
      push(renderFieldValue(field));
      push('\n');
    }

    push('\n');
  }

  return {
    title,
    body: parts.join(''),
    styleRanges,
  };
}

export function buildInsertRequests(build: ExportBuild): docs_v1.Schema$Request[] {
  const requests: docs_v1.Schema$Request[] = [];

  requests.push({
    insertText: { location: { index: 1 }, text: build.body },
  });

  for (const range of build.styleRanges) {
    requests.push({
      updateParagraphStyle: {
        range: { startIndex: range.startIndex, endIndex: range.endIndex },
        paragraphStyle: { namedStyleType: range.namedStyleType },
        fields: 'namedStyleType',
      },
    });
  }

  return requests;
}

export function buildClearRequest(endIndex: number): docs_v1.Schema$Request[] {
  if (endIndex <= 2) return [];
  return [
    {
      deleteContentRange: {
        range: { startIndex: 1, endIndex: endIndex - 1 },
      },
    },
  ];
}

function renderFieldValue(field: Field): string {
  switch (field.type) {
    case 'text':
      return (field as FieldText).value?.trim() || '—';
    case 'time': {
      const f = field as FieldTime;
      return f.value ? `${f.value}${f.tz ? ` (${f.tz})` : ''}` : '—';
    }
    case 'currency': {
      const f = field as FieldCurrency;
      if (!Number.isFinite(f.amount)) return '—';
      try {
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: f.currency || 'USD',
        }).format(f.amount);
      } catch {
        return `${f.currency || 'USD'} ${f.amount}`;
      }
    }
    case 'number': {
      const f = field as FieldNumber;
      if (!Number.isFinite(f.value)) return '—';
      return f.unit ? `${f.value} ${f.unit}` : String(f.value);
    }
    case 'url': {
      const f = field as FieldUrl;
      const href = f.href?.trim();
      if (!href) return '—';
      return f.display_text?.trim() ? `${f.display_text} (${href})` : href;
    }
    case 'checkbox_list': {
      const f = field as FieldCheckboxList;
      if (!f.items?.length) return '—';
      return f.items.map((i) => `${i.checked ? '[x]' : '[ ]'} ${i.label}`).join('\n');
    }
    case 'table': {
      const f = field as FieldTable;
      const cols = f.columns ?? [];
      const rows = f.rows ?? [];
      if (cols.length === 0 || rows.length === 0) return '—';
      const header = cols.map((c) => c.label).join('\t');
      const bodyRows = rows.map((r) => cols.map((c) => String(r[c.key] ?? '')).join('\t'));
      return [header, ...bodyRows].join('\n');
    }
    case 'contact': {
      const f = field as FieldContact;
      const entries = f.entries ?? [];
      if (entries.length === 0) return '—';
      return entries
        .map((e) => {
          const show = new Set(e.show_fields ?? []);
          const bits: string[] = [];
          if (show.has('name') && e.name) bits.push(e.name);
          if (show.has('role') && e.role) bits.push(`(${e.role})`);
          if (show.has('company') && e.company) bits.push(`— ${e.company}`);
          if (show.has('email') && e.email) bits.push(e.email);
          if (show.has('phone') && e.phone) bits.push(e.phone);
          if (show.has('notes') && e.notes) bits.push(`\n${e.notes}`);
          return bits.join(' ').trim() || '(unnamed contact)';
        })
        .join('\n');
    }
    case 'asset': {
      const label = field.label?.trim() || 'asset';
      return `[Image: ${label}]`;
    }
    default:
      return '—';
  }
}

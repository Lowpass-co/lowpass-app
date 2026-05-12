'use client';

/* ============================================
   LOWPASS — ReadOnlyPackView

   Renders a resolved pack as a read-only document.
   Drives the public /r/[token] page today; future
   in-app preview can use it too.

   Pure render: props in -> JSX out. No fetching,
   no hooks beyond what's needed for presentation.
   ============================================ */

import type { PublicRiderPayload } from '@/lib/rider-packs/web-links';
import type {
  Field,
  FieldTable,
  FieldContact,
  FieldAsset,
  FieldTime,
  FieldCurrency,
  FieldNumber,
  FieldCheckboxList,
  FieldUrl,
  FieldText,
} from '@/lib/rider-packs/types';
import { CoverPageRender } from '@/components/rider/CoverPageRender';
import { TableOfContents } from '@/components/rider/TableOfContents';

type Props = {
  payload: PublicRiderPayload;
};

export function ReadOnlyPackView({ payload }: Props) {
  const { pack, sections, signedUrls } = payload;
  const ordered = [...sections].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="bg-white text-neutral-900">
      {/* Sprint 12 §9b — cover page (logo + artist + title +
          subtitle + updated date + disclaimer). Logo URL is
          pre-resolved server-side (override → artist default →
          null). */}
      <CoverPageRender
        artistName={pack.artist_name}
        title={pack.title}
        subtitle={pack.cover_subtitle}
        disclaimer={pack.cover_disclaimer}
        logoUrl={pack.cover_logo_url}
        updatedAt={pack.updated_at}
      />

      {/* Sprint 12 §9b — auto-generated TOC. Page numbers
          render as placeholders ("Page —"); each entry is an
          in-document anchor link to #section-<key>. PDF
          pagination (§10) will replace the placeholders. */}
      <TableOfContents
        sections={ordered.map((s) => ({
          id: s.id,
          section_key: s.section_key,
          title: s.title,
          section_type: s.section_type,
        }))}
      />

      <div className="max-w-3xl mx-auto p-6 space-y-6">
        {ordered.length === 0 ? (
          <div className="text-sm text-neutral-500">This pack has no sections yet.</div>
        ) : (
          ordered.map((s) => (
            <section
              key={s.id}
              id={`section-${s.section_key}`}
              className="rounded border border-neutral-200 bg-white scroll-mt-4"
            >
              <h2 className="border-b border-neutral-200 px-4 py-2 text-sm font-medium">{s.title}</h2>
              <div className="p-4 space-y-3">
                {(s.fields as Field[]).length === 0 ? (
                  <div className="text-xs text-neutral-400">(empty)</div>
                ) : (
                  (s.fields as Field[]).map((field, idx) => (
                    <FieldRow key={`${field.key}-${idx}`} field={field} signedUrls={signedUrls} />
                  ))
                )}
              </div>
            </section>
          ))
        )}

        <footer className="pt-4 text-[10px] text-neutral-400 text-center">Shared via Lowpass</footer>
      </div>
    </div>
  );
}

function FieldRow({
  field,
  signedUrls,
}: {
  field: Field;
  signedUrls: Record<string, string | null>;
}) {
  const label = field.label?.trim() || '';
  return (
    <div className="space-y-1">
      {label && <div className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</div>}
      <FieldValue field={field} signedUrls={signedUrls} />
    </div>
  );
}

function FieldValue({
  field,
  signedUrls,
}: {
  field: Field;
  signedUrls: Record<string, string | null>;
}) {
  switch (field.type) {
    case 'text':
      return <TextValue field={field} />;
    case 'table':
      return <TableValue field={field} />;
    case 'contact':
      return <ContactValue field={field} />;
    case 'asset':
      return <AssetValue field={field} signedUrls={signedUrls} />;
    case 'time':
      return <TimeValue field={field} />;
    case 'currency':
      return <CurrencyValue field={field} />;
    case 'number':
      return <NumberValue field={field} />;
    case 'checkbox_list':
      return <CheckboxListValue field={field} />;
    case 'url':
      return <UrlValue field={field} />;
    default:
      return <div className="text-xs text-neutral-400">(unsupported field)</div>;
  }
}

function TextValue({ field }: { field: FieldText }) {
  const v = field.value ?? '';
  if (!v) return <div className="text-sm text-neutral-400">-</div>;
  return <div className="whitespace-pre-wrap text-sm">{v}</div>;
}

function TableValue({ field }: { field: FieldTable }) {
  const columns = field.columns ?? [];
  const rows = field.rows ?? [];
  if (columns.length === 0 || rows.length === 0) {
    return <div className="text-sm text-neutral-400">-</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-left">
            {columns.map((c) => (
              <th
                key={c.key}
                className="px-2 py-1 text-[10px] uppercase tracking-wide text-neutral-500 font-medium"
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-neutral-100 last:border-b-0">
              {columns.map((c) => (
                <td key={c.key} className="px-2 py-1 align-top">
                  {String(row[c.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ContactValue({ field }: { field: FieldContact }) {
  const entries = field.entries ?? [];
  if (entries.length === 0) {
    return <div className="text-sm text-neutral-400">-</div>;
  }
  return (
    <div className="space-y-2">
      {entries.map((entry, i) => {
        const show = new Set(entry.show_fields ?? []);
        const name = entry.name?.trim() || '';
        const role = entry.role?.trim() || '';
        const email = entry.email?.trim() || '';
        const phone = entry.phone?.trim() || '';
        const company = entry.company?.trim() || '';
        const notes = entry.notes?.trim() || '';

        return (
          <div key={i} className="text-sm space-y-0.5">
            {show.has('name') && name && <div className="font-medium">{name}</div>}
            {show.has('role') && role && <div className="text-xs text-neutral-500">{role}</div>}
            {show.has('company') && company && (
              <div className="text-xs text-neutral-500">{company}</div>
            )}
            {show.has('email') && email && (
              <a href={`mailto:${email}`} className="text-xs text-[var(--lp-orange)] hover:underline">
                {email}
              </a>
            )}
            {show.has('phone') && phone && <div className="text-xs text-neutral-600">{phone}</div>}
            {show.has('notes') && notes && (
              <div className="text-xs text-neutral-500 whitespace-pre-wrap">{notes}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AssetValue({
  field,
  signedUrls,
}: {
  field: FieldAsset;
  signedUrls: Record<string, string | null>;
}) {
  const id = field.asset_id ?? '';
  if (!id) return <div className="text-sm text-neutral-400">-</div>;
  const url = signedUrls[id] ?? null;
  if (!url) {
    return <div className="text-xs text-neutral-400">(asset unavailable)</div>;
  }
  return (
    <div className="space-y-1">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={field.label ?? 'asset'}
        className="max-h-72 max-w-full rounded border border-neutral-200"
      />
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="block text-[10px] text-[var(--lp-orange)] hover:underline"
      >
        Open original
      </a>
    </div>
  );
}

function TimeValue({ field }: { field: FieldTime }) {
  const v = field.value ?? '';
  if (!v) return <div className="text-sm text-neutral-400">-</div>;
  return <div className="text-sm font-mono">{v}</div>;
}

function CurrencyValue({ field }: { field: FieldCurrency }) {
  const n = field.amount;
  if (n == null || !Number.isFinite(n)) {
    return <div className="text-sm text-neutral-400">-</div>;
  }
  const code = field.currency || 'USD';
  let rendered: string;
  try {
    rendered = new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).format(n);
  } catch {
    rendered = `${code} ${n}`;
  }
  return <div className="text-sm">{rendered}</div>;
}

function NumberValue({ field }: { field: FieldNumber }) {
  const v = field.value;
  if (v == null || !Number.isFinite(v)) {
    return <div className="text-sm text-neutral-400">-</div>;
  }
  return (
    <div className="text-sm">
      {v}
      {field.unit ? ` ${field.unit}` : ''}
    </div>
  );
}

function CheckboxListValue({ field }: { field: FieldCheckboxList }) {
  const items = field.items ?? [];
  if (items.length === 0) return <div className="text-sm text-neutral-400">-</div>;
  return (
    <ul className="text-sm space-y-0.5">
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-2">
          <span
            className={`inline-block h-3 w-3 rounded-sm border ${
              item.checked
                ? 'border-[var(--lp-orange)] bg-[var(--lp-orange)]'
                : 'border-neutral-300 bg-white'
            }`}
            aria-hidden
          />
          <span>{item.label}</span>
        </li>
      ))}
    </ul>
  );
}

function UrlValue({ field }: { field: FieldUrl }) {
  const href = field.href?.trim() ?? '';
  if (!href) return <div className="text-sm text-neutral-400">-</div>;
  const label = field.display_text?.trim() || href;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-sm text-[var(--lp-orange)] hover:underline break-all"
    >
      {label}
    </a>
  );
}

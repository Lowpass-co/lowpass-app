'use client';

/* ============================================
   LOWPASS — ReadOnlyPackView

   Renders a resolved pack as a read-only document.
   Drives the public /r/[token] page today; future
   in-app preview can use it too.

   Pure render: props in -> JSX out. No fetching,
   no hooks beyond what's needed for presentation.
   ============================================ */

import React from 'react';
import type { PublicRiderPayload } from '@/lib/rider-packs/web-links';
import { RIDER_GROUPS, sectionGroupId } from '@/lib/rider-packs/groups';
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
  ChannelListRow,
  MicLibraryEntry,
  StageBox,
  SubSnake,
} from '@/lib/rider-packs/types';
import {
  aggregateCables,
  aggregateMicsByProvider,
  aggregateStands,
  aggregateStageBoxes,
  aggregateSubSnakes,
} from '@/lib/rider-packs/aggregates';
import { CoverPageRender } from '@/components/rider/CoverPageRender';
import { TableOfContents } from '@/components/rider/TableOfContents';

type Props = {
  payload: PublicRiderPayload;
  /** Sprint 12 §10 — set when rendering for PDF/print. Adds
   *  the .lp-pdf-* class hooks the print stylesheet uses for
   *  page breaks + footer placement. No visual change in the
   *  web reader. */
  printMode?: boolean;
};

export function ReadOnlyPackView({ payload, printMode = false }: Props) {
  const { pack, sections, signedUrls, mics } = payload;
  const ordered = [...sections].sort((a, b) => a.sort_order - b.sort_order);
  /* Sprint 12 §10 follow-up — mic kind-tag lookup. Empty when
     the pack has no channel_list sections (the producer
     routes skip the fetch in that case). */
  const micsByName = React.useMemo(() => {
    const m = new Map<string, MicLibraryEntry>();
    for (const entry of mics ?? []) {
      m.set(entry.name.trim().toLowerCase(), entry);
    }
    return m;
  }, [mics]);

  /* B3 (rider decouple) — the venue-facing view groups sections with the
     SAME grammar the builder uses (lib/rider-packs/groups.ts): sticky top
     group chips + a left section list, both anchor-driven so print CSS and
     the PDF path stay linear documents. Headings only appear when the pack
     actually spans ≥2 groups — an all-Production legacy rider reads exactly
     as it always did. */
  const grouped = RIDER_GROUPS
    .map((g) => ({ ...g, items: ordered.filter((s) => sectionGroupId(s.metadata) === g.id) }))
    .filter((g) => g.items.length > 0);
  const multiGroup = grouped.length > 1;

  return (
    <div className="bg-white text-neutral-900">
      {/* Sprint 12 §9b — cover page (logo + artist + title +
          subtitle + updated date + disclaimer). Logo URL is
          pre-resolved server-side (override → artist default →
          null). */}
      <div className={printMode ? 'lp-pdf-cover' : undefined}>
        <CoverPageRender
          artistName={pack.artist_name}
          title={pack.title}
          subtitle={pack.cover_subtitle}
          disclaimer={pack.cover_disclaimer}
          logoUrl={pack.cover_logo_url}
          updatedAt={pack.updated_at}
        />
      </div>

      {/* Sprint 12 §9b — auto-generated TOC. Page numbers
          render as placeholders ("Page —"); each entry is an
          in-document anchor link to #section-<key>. PDF
          pagination (§10) will replace the placeholders. */}
      <div className={printMode ? 'lp-pdf-toc' : undefined}>
        <TableOfContents
          sections={ordered.map((s) => ({
            id: s.id,
            section_key: s.section_key,
            title: s.title,
            section_type: s.section_type,
          }))}
        />
      </div>

      {/* B3 — sticky group chips (screen only; print stays a linear doc). */}
      {multiGroup && !printMode ? (
        <nav className="sticky top-0 z-10 border-b border-neutral-200 bg-white/95 px-4 py-2 backdrop-blur print:hidden">
          <div className="mx-auto flex max-w-5xl flex-wrap gap-1">
            {grouped.map((g) => (
              <a
                key={g.id}
                href={`#group-${g.id}`}
                className="rounded-full border border-neutral-200 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-neutral-600 hover:border-neutral-400 hover:text-neutral-900"
              >
                {g.label}
              </a>
            ))}
          </div>
        </nav>
      ) : null}

      <div className={multiGroup && !printMode ? 'mx-auto flex max-w-5xl gap-6 p-6' : 'max-w-3xl mx-auto p-6 space-y-6'}>
        {/* B3 — left section list, sticky, grouped. Screen only. */}
        {multiGroup && !printMode ? (
          <aside className="sticky top-14 hidden max-h-[80vh] w-52 shrink-0 self-start overflow-y-auto md:block print:hidden">
            {grouped.map((g) => (
              <div key={g.id} className="mb-3">
                <a
                  href={`#group-${g.id}`}
                  className="block text-[10px] font-bold uppercase tracking-wider text-neutral-400 hover:text-neutral-600"
                >
                  {g.label}
                </a>
                <ul className="mt-1 space-y-0.5">
                  {g.items.map((s) => (
                    <li key={s.id}>
                      <a
                        href={`#section-${s.section_key}`}
                        className="block truncate rounded px-1.5 py-0.5 text-xs text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                      >
                        {s.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </aside>
        ) : null}

        <div className="min-w-0 flex-1 space-y-6">
          {ordered.length === 0 ? (
            <div className="text-sm text-neutral-500">This pack has no sections yet.</div>
          ) : (
            grouped.map((g) => (
              <React.Fragment key={g.id}>
                {multiGroup ? (
                  <h2
                    id={`group-${g.id}`}
                    className={`scroll-mt-14 border-b-2 border-neutral-900 pb-1 text-xs font-bold uppercase tracking-widest text-neutral-900${printMode ? ' lp-pdf-group-heading' : ''}`}
                  >
                    {g.label}
                  </h2>
                ) : null}
                {g.items.map((s) => (
                  <section
                    key={s.id}
                    id={`section-${s.section_key}`}
                    className="rounded border border-neutral-200 bg-white scroll-mt-14"
                  >
                    <h2 className="border-b border-neutral-200 px-4 py-2 text-sm font-medium">{s.title}</h2>
                    <div className="p-4 space-y-3">
                      <SectionBody section={s} signedUrls={signedUrls} micsByName={micsByName} />
                    </div>
                  </section>
                ))}
              </React.Fragment>
            ))
          )}

          <footer className="pt-4 text-[10px] text-neutral-400 text-center">Shared via Lowpass</footer>
        </div>
      </div>
    </div>
  );
}

/* Sprint 12 §10 — dispatch on section_type. Pre-§10 the public
   reader rendered only the legacy `fields` array and showed
   "(empty)" for rich_text + advance_summary sections. Now each
   gets its own minimal renderer based on what §9 put on
   `metadata`. channel_list still falls through to fields-or-
   empty because its data lives in separate tables that aren't
   currently surfaced on PublicRiderPayload — tracked as a §10
   follow-up. */
function SectionBody({
  section,
  signedUrls,
  micsByName,
}: {
  section: PublicRiderPayload['sections'][number];
  signedUrls: Record<string, string | null>;
  micsByName: Map<string, MicLibraryEntry>;
}) {
  const type = section.section_type ?? 'fields';

  if (type === 'rich_text') {
    const content = (section.metadata as { content?: unknown } | null)?.content;
    if (!content) return <div className="text-xs text-neutral-400">(empty)</div>;
    return <RichTextBody node={content} />;
  }

  if (type === 'advance_summary') {
    const summary = (section.metadata as { summary?: unknown } | null)?.summary;
    if (!Array.isArray(summary) || summary.length === 0) {
      return <div className="text-xs text-neutral-400">(empty)</div>;
    }
    return <AdvanceSummaryBody rows={summary as Array<{ subject?: string; body?: string }>} />;
  }

  if (type === 'channel_list') {
    return (
      <ChannelListBody
        rows={section.rows ?? []}
        subSnakes={section.sub_snakes ?? []}
        stageBoxes={section.stage_boxes ?? []}
        micsByName={micsByName}
      />
    );
  }

  const fields = (section.fields as Field[]) ?? [];
  if (fields.length === 0) {
    return <div className="text-xs text-neutral-400">(empty)</div>;
  }
  return (
    <>
      {fields.map((field, idx) => (
        <FieldRow key={`${field.key}-${idx}`} field={field} signedUrls={signedUrls} />
      ))}
    </>
  );
}

/* ----------------------------------------------------------
   Channel list — read-only mirror of the editor's grid.

   Shares Tiptap-of-channel-list intent with the PDF render in
   pdf-render.ts: 11-col input grid + 5-col output grid + 5
   inventory aggregate sub-tables. The PDF + the web view
   should look the same — both share the data shape on
   PublicRiderPayload, and both compute aggregates from the
   same helpers (lib/rider-packs/aggregates).

   READ-ONLY: no edit affordances, no select dropdowns. Values
   render as plain text + colour-coded badges (mic kind /
   phantom / sub-snake stripe).
   ---------------------------------------------------------- */
const MIC_KIND_BADGE: Record<MicLibraryEntry['type'], { label: string; tone: string }> = {
  dynamic: { label: 'DYN', tone: 'var(--lp-text-secondary)' },
  condenser: { label: 'CON', tone: 'var(--lp-orange)' },
  ribbon: { label: 'RIB', tone: 'var(--lp-text-secondary)' },
  di_active: { label: 'DI+', tone: 'var(--lp-orange)' },
  di_passive: { label: 'DI', tone: 'var(--lp-text-secondary)' },
};

const PROVIDER_LABEL: Record<string, string> = {
  band: 'Band',
  venue: 'Venue',
  hire: 'Hire',
  unspecified: 'Unspecified',
};

const INPUT_COLS =
  '4px 1.8rem minmax(0,1.4fr) minmax(0,0.55fr) minmax(0,0.7fr) minmax(0,0.7fr) minmax(0,0.55fr) minmax(0,1fr) minmax(0,0.55fr) 1.4rem minmax(0,0.55fr) minmax(0,1.1fr)';
const OUTPUT_COLS =
  '1.8rem minmax(0,1.4fr) minmax(0,1fr) minmax(0,0.55fr) 2.2rem minmax(0,1.2fr)';

function ChannelListBody({
  rows,
  subSnakes,
  stageBoxes,
  micsByName,
}: {
  rows: ChannelListRow[];
  subSnakes: SubSnake[];
  stageBoxes: StageBox[];
  micsByName: Map<string, MicLibraryEntry>;
}) {
  const inputs = rows.filter((r) => (r.row_kind ?? 'input') === 'input');
  const outputs = rows.filter((r) => r.row_kind === 'output');
  const subById = React.useMemo(
    () => new Map(subSnakes.map((s) => [s.id, s])),
    [subSnakes],
  );
  const stageById = React.useMemo(
    () => new Map(stageBoxes.map((s) => [s.id, s])),
    [stageBoxes],
  );

  return (
    <div className="space-y-3 text-[11px]">
      {inputs.length === 0 ? (
        <div className="text-xs text-neutral-400">No channels.</div>
      ) : (
        <div className="overflow-hidden rounded border border-neutral-200">
          <div
            className="grid bg-neutral-50 text-[9px] font-semibold uppercase tracking-wider text-neutral-500"
            style={{ gridTemplateColumns: INPUT_COLS }}
          >
            <div />
            <div className="px-1 py-1.5">#</div>
            <div className="px-1 py-1.5">Name</div>
            <div className="px-1 py-1.5">Pos</div>
            <div className="px-1 py-1.5">Stage Box</div>
            <div className="px-1 py-1.5">Loom</div>
            <div className="px-1 py-1.5">Cable</div>
            <div className="px-1 py-1.5">Mic / DI</div>
            <div className="px-1 py-1.5">Stand</div>
            <div className="px-1 py-1.5 text-center">+48</div>
            <div className="px-1 py-1.5">Prov</div>
            <div className="px-1 py-1.5">Notes</div>
          </div>
          {inputs.map((r) => (
            <InputRow
              key={r.id}
              row={r}
              sub={r.sub_snake_id ? subById.get(r.sub_snake_id) ?? null : null}
              stage={r.stage_box_id ? stageById.get(r.stage_box_id) ?? null : null}
              micEntry={micsByName.get((r.mic || r.di || '').trim().toLowerCase()) ?? null}
            />
          ))}
        </div>
      )}

      {outputs.length > 0 && (
        <div className="overflow-hidden rounded border border-neutral-200">
          <h4 className="border-b border-neutral-200 bg-neutral-50 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-neutral-500">
            Outputs ({outputs.length})
          </h4>
          <div
            className="grid bg-neutral-50 text-[9px] font-semibold uppercase tracking-wider text-neutral-500"
            style={{ gridTemplateColumns: OUTPUT_COLS }}
          >
            <div className="px-1 py-1.5">#</div>
            <div className="px-1 py-1.5">Item</div>
            <div className="px-1 py-1.5">Destination</div>
            <div className="px-1 py-1.5">Pos</div>
            <div className="px-1 py-1.5 text-center">QTY</div>
            <div className="px-1 py-1.5">Notes</div>
          </div>
          {outputs.map((r) => (
            <OutputRow key={r.id} row={r} />
          ))}
        </div>
      )}

      <ChannelAggregates rows={rows} subSnakes={subSnakes} stageBoxes={stageBoxes} />
    </div>
  );
}

function InputRow({
  row,
  sub,
  stage,
  micEntry,
}: {
  row: ChannelListRow;
  sub: SubSnake | null;
  stage: StageBox | null;
  micEntry: MicLibraryEntry | null;
}) {
  const subLabel = sub && row.sub_snake_position != null ? `${sub.label}-${row.sub_snake_position}` : '';
  const stageLabel =
    stage && row.stage_box_position != null ? `${stage.label}-${row.stage_box_position}` : '';
  const mic = (row.mic || row.di || '').trim();
  const badge = micEntry ? MIC_KIND_BADGE[micEntry.type] : null;
  const provider = row.provider ? PROVIDER_LABEL[row.provider] ?? row.provider : '—';
  return (
    <div
      className="grid items-center border-t border-neutral-100 text-[11px]"
      style={{ gridTemplateColumns: INPUT_COLS }}
    >
      <div
        className="h-full self-stretch"
        style={{ background: sub?.colour ?? 'transparent', minWidth: 4 }}
        aria-hidden
      />
      <div className="px-1 py-1 text-center font-mono text-[10px] text-neutral-500 tabular-nums">{row.row_index}</div>
      <div className="truncate px-1 py-1 font-medium">{row.channel_name}</div>
      <div className="truncate px-1 py-1">{row.position}</div>
      <div className="truncate px-1 py-1">{stageLabel}</div>
      <div className="truncate px-1 py-1">{subLabel}</div>
      <div className="truncate px-1 py-1">{row.cable_length ?? ''}</div>
      <div className="flex min-w-0 items-center gap-1 px-1 py-1">
        {badge && (
          <span
            aria-hidden
            className="inline-flex shrink-0 items-center justify-center rounded text-white"
            style={{
              background: badge.tone,
              padding: '1px 3px',
              fontSize: 8,
              fontWeight: 700,
              letterSpacing: '0.04em',
              minWidth: 18,
            }}
          >
            {badge.label}
          </span>
        )}
        <span className="truncate">{mic}</span>
      </div>
      <div className="truncate px-1 py-1">{row.stand ?? ''}</div>
      <div className="px-1 py-1 text-center">
        {row.phantom_power === true ? (
          <span className="font-semibold text-emerald-600">✓</span>
        ) : row.phantom_power === false ? (
          <span className="text-neutral-400">·</span>
        ) : (
          <span className="text-neutral-300">—</span>
        )}
      </div>
      <div
        className={`truncate px-1 py-1 ${row.provider ? '' : 'italic text-neutral-400'}`}
      >
        {provider}
      </div>
      <div className="truncate px-1 py-1 text-neutral-600">{row.notes}</div>
    </div>
  );
}

function OutputRow({ row }: { row: ChannelListRow }) {
  return (
    <div
      className="grid items-center border-t border-neutral-100 text-[11px]"
      style={{ gridTemplateColumns: OUTPUT_COLS }}
    >
      <div className="px-1 py-1 text-center font-mono text-[10px] text-neutral-500 tabular-nums">{row.row_index}</div>
      <div className="truncate px-1 py-1">{row.output_item ?? ''}</div>
      <div className="truncate px-1 py-1">{row.output_destination ?? ''}</div>
      <div className="truncate px-1 py-1">{row.position}</div>
      <div className="px-1 py-1 text-center tabular-nums">
        {row.output_qty == null ? '' : row.output_qty}
      </div>
      <div className="truncate px-1 py-1 text-neutral-600">{row.output_notes ?? ''}</div>
    </div>
  );
}

function ChannelAggregates({
  rows,
  subSnakes,
  stageBoxes,
}: {
  rows: ChannelListRow[];
  subSnakes: SubSnake[];
  stageBoxes: StageBox[];
}) {
  const mics = aggregateMicsByProvider(rows);
  const stands = aggregateStands(rows);
  const cables = aggregateCables(rows);
  const boxes = aggregateStageBoxes(stageBoxes);
  const snakes = aggregateSubSnakes(subSnakes);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <AggBlock title={`Mics / DIs (${mics.length})`} cols="3rem 1fr 5rem" head={['QTY', 'ITEM', 'PROVIDER']} empty="No mics or DIs assigned.">
        {mics.map((m, i) => (
          <AggRow key={`${m.item}|${m.provider}|${i}`}>
            <span className="font-mono font-semibold tabular-nums">{m.qty}</span>
            <span className="truncate">{m.item}</span>
            <span className={m.provider === 'unspecified' ? 'italic text-neutral-400' : ''}>
              {PROVIDER_LABEL[m.provider] ?? m.provider}
            </span>
          </AggRow>
        ))}
      </AggBlock>
      <AggBlock title={`Mic stands (${stands.length})`} cols="3rem 1fr" head={['QTY', 'ITEM']} empty="No mic stands assigned.">
        {stands.map((s, i) => (
          <AggRow key={`${s.item}|${i}`}>
            <span className="font-mono font-semibold tabular-nums">{s.qty}</span>
            <span className="truncate">{s.item}</span>
          </AggRow>
        ))}
      </AggBlock>
      <AggBlock title={`Cables (${cables.length})`} cols="3rem 1fr" head={['QTY', 'LENGTH']} empty="No cable lengths recorded.">
        {cables.map((c, i) => (
          <AggRow key={`${c.length}|${i}`}>
            <span className="font-mono font-semibold tabular-nums">{c.qty}</span>
            <span className="truncate">{c.length}</span>
          </AggRow>
        ))}
      </AggBlock>
      <AggBlock title={`Stage boxes (${boxes.length})`} cols="1fr auto 4rem" head={['NAME', 'COLOR', 'CAPACITY']} empty="No stage boxes.">
        {boxes.map((b) => (
          <AggRow key={b.id}>
            <span className="truncate">{b.label}</span>
            <Swatch hex={b.colour} />
            <span className="font-mono font-semibold tabular-nums">{b.capacity}</span>
          </AggRow>
        ))}
      </AggBlock>
      <AggBlock title={`Snakes / Looms (${snakes.length})`} cols="1fr auto 4rem" head={['LABEL', 'COLOR', 'CAPACITY']} empty="No sub-snakes.">
        {snakes.map((s) => (
          <AggRow key={s.id}>
            <span className="truncate">{s.label}</span>
            <Swatch hex={s.colour} />
            <span className="font-mono font-semibold tabular-nums">{s.capacity}</span>
          </AggRow>
        ))}
      </AggBlock>
    </div>
  );
}

function AggBlock({
  title,
  cols,
  head,
  empty,
  children,
}: {
  title: string;
  cols: string;
  head: string[];
  empty: string;
  children: React.ReactNode;
}) {
  const arr = React.Children.toArray(children);
  return (
    <section className="space-y-1.5">
      <h4 className="text-[9px] font-semibold uppercase tracking-wider text-neutral-500">{title}</h4>
      {arr.length === 0 ? (
        <div className="rounded border border-dashed border-neutral-300 bg-neutral-50 px-3 py-2 text-center text-[11px] italic text-neutral-500">
          {empty}
        </div>
      ) : (
        <div
          className="overflow-hidden rounded border border-neutral-200 bg-white text-[11px]"
          style={{ ['--cols' as string]: cols } as React.CSSProperties}
        >
          <div
            className="grid items-center border-b border-neutral-200 bg-neutral-50 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-neutral-500"
            style={{ gridTemplateColumns: 'var(--cols)', gap: '0.5rem' }}
          >
            {head.map((h, i) => (
              <div key={`${h}-${i}`}>{h}</div>
            ))}
          </div>
          <div>{arr}</div>
        </div>
      )}
    </section>
  );
}

function AggRow({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="grid items-center border-b border-neutral-100 px-2 py-1 last:border-b-0"
      style={{ gridTemplateColumns: 'var(--cols)', gap: '0.5rem' }}
    >
      {React.Children.map(children, (c, i) => (
        <div key={i} className="min-w-0">
          {c}
        </div>
      ))}
    </div>
  );
}

function Swatch({ hex }: { hex: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-neutral-500">
      <span
        aria-hidden
        className="inline-block rounded-sm border border-neutral-200"
        style={{ width: 10, height: 10, background: hex }}
      />
      {hex}
    </span>
  );
}

/* ----------------------------------------------------------
   Rich-text (Tiptap doc) renderer.

   Recognises the doc shapes our editor produces: heading
   (levels 2 + 3), paragraph, bullet_list, list_item, text,
   variableNode (chip). Anything else falls through as nested
   children, so unrecognised marks don't drop content.
   ---------------------------------------------------------- */
interface TiptapNodeLike {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNodeLike[];
  text?: string;
}

function RichTextBody({ node }: { node: unknown }) {
  return <div className="lp-prose">{renderTiptapNode(node, 'root')}</div>;
}

function renderTiptapNode(node: unknown, key: string): React.ReactNode {
  if (node === null || typeof node !== 'object') return null;
  const n = node as TiptapNodeLike;
  const children = Array.isArray(n.content)
    ? n.content.map((c, i) => renderTiptapNode(c, `${key}-${i}`))
    : null;

  switch (n.type) {
    case 'doc':
      return <React.Fragment key={key}>{children}</React.Fragment>;
    case 'heading': {
      const level = Number(n.attrs?.level) === 3 ? 3 : 2;
      return level === 3 ? <h3 key={key}>{children}</h3> : <h2 key={key}>{children}</h2>;
    }
    case 'paragraph':
      return <p key={key}>{children}</p>;
    case 'bulletList':
    case 'bullet_list':
      return <ul key={key}>{children}</ul>;
    case 'listItem':
    case 'list_item':
      return <li key={key}>{children}</li>;
    case 'text':
      return <React.Fragment key={key}>{n.text ?? ''}</React.Fragment>;
    case 'variableNode': {
      /* Public reader pre-resolves variable nodes into text
         (see /api/public/rider/[token]/route.ts). Anything
         that slips through unresolved we render as a labelled
         chip so the reader can see the gap. */
      const label = typeof n.attrs?.label === 'string'
        ? n.attrs.label
        : typeof n.attrs?.token === 'string'
          ? n.attrs.token
          : 'variable';
      return <span key={key} className="lp-var">{`{${label}}`}</span>;
    }
    default:
      return <React.Fragment key={key}>{children}</React.Fragment>;
  }
}

/* ----------------------------------------------------------
   Advance summary renderer — 9-line scannable table.
   ---------------------------------------------------------- */
function AdvanceSummaryBody({
  rows,
}: {
  rows: Array<{ subject?: string; body?: string }>;
}) {
  return (
    <table className="lp-summary">
      <tbody>
        {rows.map((row, i) => {
          const subject = (row.subject ?? '').trim();
          const body = (row.body ?? '').trim();
          if (!subject && !body) return null;
          return (
            <tr key={i}>
              <td className="lp-summary-subject">{subject || '—'}</td>
              <td className="lp-summary-body">{body || '—'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
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

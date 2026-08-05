'use client';

import { useMemo } from 'react';
import Link from 'next/link';

import { SpreadsheetGrid } from '@/components/spreadsheet-grid/SpreadsheetGrid';
import type { GridColumn, GridRow } from '@/components/spreadsheet-grid/types';

import type { ChannelListRow, ResolvedSection } from '@/lib/rider-packs/types';

type RowVm = ChannelListRow & { id: string };

function labelLookup<T extends { id: string; label: string }>(list: T[], id: string | null): string {
  if (!id) return '—';
  return list.find((x) => x.id === id)?.label ?? id.slice(0, 6);
}

function formatPos(label: string, pos: number | null): string {
  if (pos == null) return '—';
  return `${label}-${pos}`;
}

/**
 * Build read-only computed columns for the channel list. All cells render
 * via {@link kind: 'computed'} since the channel list is edited in the rider
 * pack editor, not here.
 */
function buildColumns(
  subSnakes: ResolvedSection['subSnakes'],
  stageBoxes: ResolvedSection['stageBoxes'],
): GridColumn<RowVm>[] {
  const ss = subSnakes ?? [];
  const sb = stageBoxes ?? [];
  return [
    {
      id: 'row_index',
      header: '#',
      accessor: 'row_index',
      type: { kind: 'computed', render: (r) => (r as RowVm).row_index },
      width: 44,
      align: 'right',
    },
    {
      id: 'source',
      header: 'Source',
      accessor: 'channel_name',
      type: { kind: 'computed', render: (r) => ((r as RowVm).channel_name ?? '').trim() || '—' },
      width: 160,
      flex: true,
    },
    {
      id: 'mic_di',
      header: 'Mic / DI',
      accessor: 'mic',
      type: {
        kind: 'computed',
        render: (r) => {
          const row = r as RowVm;
          return [row.mic, row.di].filter((x) => (x ?? '').trim()).join(' · ') || '—';
        },
      },
      width: 144,
    },
    {
      id: 'sub_snake',
      header: 'Sub-snake',
      accessor: 'sub_snake_id',
      type: {
        kind: 'computed',
        render: (r) => {
          const row = r as RowVm;
          return formatPos(labelLookup(ss, row.sub_snake_id), row.sub_snake_position);
        },
      },
      width: 128,
    },
    {
      id: 'stage_box',
      header: 'Stage I/O',
      accessor: 'stage_box_id',
      type: {
        kind: 'computed',
        render: (r) => {
          const row = r as RowVm;
          return formatPos(labelLookup(sb, row.stage_box_id), row.stage_box_position);
        },
      },
      width: 128,
    },
    {
      id: 'io_hint',
      header: 'I/O',
      accessor: 'sub_snake_id',
      type: {
        kind: 'computed',
        render: (r) => {
          const row = r as RowVm;
          return (
            [labelLookup(ss, row.sub_snake_id), labelLookup(sb, row.stage_box_id)]
              .filter((x, i, a) => a.indexOf(x) === i && x !== '—')
              .slice(0, 2)
              .join(' · ') || '—'
          );
        },
      },
      width: 96,
    },
    {
      id: 'position',
      header: 'Insert',
      accessor: 'position',
      type: { kind: 'computed', render: (r) => (r as RowVm).position ?? '' },
      width: 80,
    },
    {
      id: 'phantom',
      header: 'Ph.',
      accessor: 'phantom_power',
      type: {
        kind: 'computed',
        render: (r) => {
          const v = (r as RowVm).phantom_power;
          return v === true ? 'On' : v === false ? 'Off' : '—';
        },
      },
      width: 56,
    },
    {
      id: 'notes_preview',
      header: 'Notes',
      accessor: 'notes',
      type: {
        kind: 'computed',
        render: (r) => ((r as RowVm).notes ?? '').trim().slice(0, 80) || '—',
      },
      width: 160,
    },
  ];
}

/** Read-only UX15 presentation of the tour rider-pack channel list (editable in Rider pack editor). */
export function ChannelListTourSheet({
  tourId,
  packId,
  section,
  editHref,
}: {
  tourId: string;
  packId: string;
  section: ResolvedSection;
  /** Reserved for future per-row currency display; not currently consumed. */
  tourDefaultCurrency?: string;
  /** Decouple B1 — where "Edit" should go. Defaults to the legacy
   *  /tours/[id]/rider-packs URL (still resolves via next.config redirects);
   *  the rider tech-section preview passes /rider-packs/[docId] instead.
   *  Pass null to hide the edit affordance entirely (a read-only sheet whose
   *  edit path is elsewhere — e.g. the owned-legacy convert state). */
  editHref?: string | null;
}) {
  const href = editHref === null ? null : editHref ?? `/tours/${tourId}/rider-packs/${packId}`;
  const subSnakes = useMemo(() => section.subSnakes ?? [], [section.subSnakes]);
  const stageBoxes = useMemo(() => section.stageBoxes ?? [], [section.stageBoxes]);

  const columns = useMemo<GridColumn<RowVm>[]>(
    () => buildColumns(subSnakes, stageBoxes),
    [subSnakes, stageBoxes],
  );

  const rows = useMemo<GridRow<RowVm>[]>(() => {
    const raw = section.rows ?? [];
    return [...raw]
      .sort((a, b) => a.row_index - b.row_index)
      .map((r) => ({
        id: r.id,
        data: { ...r, id: r.id } as RowVm,
        // Whole sheet is read-only; mark every row computed.
        computed: true,
        // TODO(UX15.1): per-row colour strip from stage_box / sub_snake colour
        // requires either a `style` slot on GridRow or a CSS-var-based class
        // approach. Foundation grid doesn't expose a style hook today.
      }));
  }, [section.rows]);

  const empty = rows.length === 0;

  return (
    <div className="space-y-4 print:break-inside-avoid">
      <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div>
          <p className="text-sm font-semibold text-lp-text">{section.title || 'Channel list'}</p>
          {section.inherited_from ? (
            <p className="mt-1 text-xs text-lp-text-secondary">
              Inherited from {section.inherited_from} scope
            </p>
          ) : null}
        </div>
        {href !== null ? (
          <Link
            href={href}
            className="shrink-0 rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-xs font-semibold uppercase tracking-wide text-lp-orange hover:bg-lp-orange-subtle"
          >
            {editHref ? 'Edit channel list ↗' : 'Edit in rider pack →'}
          </Link>
        ) : null}
      </div>

      {empty ? (
        <p className="rounded-lg border border-dashed border-lp-border px-4 py-8 text-center text-sm text-lp-text-secondary">
          No channel list rows yet.
          {href !== null ? (
            <>
              {' '}Add a Channel list section and rows in the{' '}
              <Link className="text-lp-orange hover:underline" href={href}>
                {editHref ? 'channel list editor' : 'rider pack editor'}
              </Link>
              .
            </>
          ) : null}
        </p>
      ) : (
        <SpreadsheetGrid<RowVm>
          columns={columns}
          rows={rows}
          ariaLabel="Tour channel list"
          columnWidthsKey={`lp-cols-channel:${tourId}`}
        />
      )}
    </div>
  );
}

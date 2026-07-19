'use client';

/* ============================================
   LOWPASS — <InventoryAggregates> (Sprint 12 §8b3)

   The five "inventory" views Adam's actual channel-list
   sheet surfaces alongside the per-channel rows. All render-
   only, computed at render time from rows + the supporting
   stage_boxes / sub_snakes tables. No new schema; the
   five aggregate compute helpers live in
   src/lib/rider-packs/aggregates.ts.

     1. Microphones / DIs    QTY · ITEM · Provider
     2. Mic stands           QTY · ITEM
     3. Cables               QTY · LENGTH
     4. Stage boxes          NAME · COLOR · CAPACITY
     5. Snakes / Looms       LABEL · COLOR · CAPACITY

   Empty states show "No <thing> in this list yet" so the
   operator sees the empty slots rather than the section
   collapsing. Headers use the same uppercase-tracking-wider
   treatment as the Outputs section header from §8b2.

   Editable per-row Notes on the Mics/DIs aggregate (per the
   §8b3 spec) is deferred. rider_sections.fields is a closed
   JSONB array constrained to the Field discriminated union;
   adding inventory_notes there would either need a new
   schema column or a magic-key hack. The spec said "render-
   only, no schema migration" for §8b3 — surfacing this gap
   for Adam to decide whether to add a column later or accept
   notes-less aggregates.
   ============================================ */

import { useMemo } from 'react';
import type { ChannelListRow, StageBox, SubSnake } from '@/lib/rider-packs/types';
import {
  aggregateCables,
  aggregateMicsByProvider,
  aggregateStands,
  aggregateStageBoxes,
  aggregateSubSnakes,
} from '@/lib/rider-packs/aggregates';

interface InventoryAggregatesProps {
  rows: ChannelListRow[];
  stageBoxes: StageBox[];
  subSnakes: SubSnake[];
  /* G2-2b — a stage box's "Patch" button now opens the MAIN patch matrix
     (patch mode) with that box pre-filtered, instead of a separate old-style
     modal. The parent enters patch mode + focuses the box. */
  onPatchBox?: (boxId: string) => void;
}

const PROVIDER_LABEL: Record<string, string> = {
  band: 'Band',
  venue: 'Venue',
  hire: 'Hire',
  unspecified: 'Unspecified',
};

export function InventoryAggregates({
  rows,
  stageBoxes,
  subSnakes,
  onPatchBox,
}: InventoryAggregatesProps) {
  const mics = useMemo(() => aggregateMicsByProvider(rows), [rows]);
  const stands = useMemo(() => aggregateStands(rows), [rows]);
  const cables = useMemo(() => aggregateCables(rows), [rows]);
  const boxes = useMemo(() => aggregateStageBoxes(stageBoxes), [stageBoxes]);
  const snakes = useMemo(() => aggregateSubSnakes(subSnakes), [subSnakes]);
  return (
    <div
      className="flex flex-col"
      style={{
        gap: 'var(--lp-space-4)',
        padding: 'var(--lp-space-4) var(--lp-space-3) var(--lp-space-3)',
        borderTop: '1px solid var(--lp-border)',
        background: 'var(--lp-bg)',
      }}
    >
      {/* 1. Microphones / DIs */}
      <Section title={`Mics / DIs (${mics.length})`}>
        {mics.length === 0 ? (
          <Empty>No mics or DIs assigned to channels yet.</Empty>
        ) : (
          <Table
            colTemplate="3.5rem minmax(8rem, 1fr) minmax(5rem, auto)"
            head={['QTY', 'ITEM', 'PROVIDER']}
            rows={mics.map((m, i) => (
              <Row
                key={`${m.item}|${m.provider}|${i}`}
                cols={[
                  <Num key="qty">{m.qty}</Num>,
                  <Cell key="item">{m.item}</Cell>,
                  <Cell key="prov" muted={m.provider === 'unspecified'}>
                    {PROVIDER_LABEL[m.provider] ?? m.provider}
                  </Cell>,
                ]}
              />
            ))}
          />
        )}
      </Section>

      {/* 2. Mic stands */}
      <Section title={`Mic stands (${stands.length})`}>
        {stands.length === 0 ? (
          <Empty>No mic stands assigned yet.</Empty>
        ) : (
          <Table
            colTemplate="3.5rem minmax(8rem, 1fr)"
            head={['QTY', 'ITEM']}
            rows={stands.map((s, i) => (
              <Row
                key={`${s.item}|${i}`}
                cols={[<Num key="qty">{s.qty}</Num>, <Cell key="item">{s.item}</Cell>]}
              />
            ))}
          />
        )}
      </Section>

      {/* 3. Cables */}
      <Section title={`Cables (${cables.length})`}>
        {cables.length === 0 ? (
          <Empty>No cable lengths recorded yet.</Empty>
        ) : (
          <Table
            colTemplate="3.5rem minmax(8rem, 1fr)"
            head={['QTY', 'LENGTH']}
            rows={cables.map((c, i) => (
              <Row
                key={`${c.length}|${i}`}
                cols={[<Num key="qty">{c.qty}</Num>, <Cell key="len">{c.length}</Cell>]}
              />
            ))}
          />
        )}
      </Section>

      {/* 4. Stage boxes — the per-box "Patch" button opens the MAIN patch matrix
          (G2-2b) with this box pre-filtered via the Boxes filter. */}
      <Section title={`Stage boxes (${boxes.length})`}>
        {boxes.length === 0 ? (
          <Empty>No stage boxes — use &ldquo;Manage stage I/O&rdquo; to add.</Empty>
        ) : (
          <Table
            colTemplate="minmax(6rem, 1fr) auto 4.5rem 4.5rem"
            head={['NAME', 'COLOR', 'CAPACITY', '']}
            rows={boxes.map((b) => (
              <Row
                key={b.id}
                cols={[
                  <Cell key="name">{b.label}</Cell>,
                  <ColorSwatch key="color" hex={b.colour} />,
                  <Num key="cap">{b.capacity}</Num>,
                  onPatchBox ? (
                    <button
                      key="patch"
                      type="button"
                      onClick={() => onPatchBox(b.id)}
                      className="rounded border border-lp-border bg-lp-bg px-2 py-0.5 text-xs font-medium text-lp-text-secondary hover:bg-lp-surface-hover hover:text-lp-text"
                      title={`Patch ${b.label} in the patch matrix`}
                    >
                      Patch
                    </button>
                  ) : <span key="patch" />,
                ]}
              />
            ))}
          />
        )}
      </Section>

      {/* 5. Snakes / Looms */}
      <Section title={`Snakes / Looms (${snakes.length})`}>
        {snakes.length === 0 ? (
          <Empty>No sub-snakes — use &ldquo;Manage sub-snakes&rdquo; to add.</Empty>
        ) : (
          <Table
            colTemplate="minmax(6rem, 1fr) auto 4.5rem"
            head={['LABEL', 'COLOR', 'CAPACITY']}
            rows={snakes.map((s) => (
              <Row
                key={s.id}
                cols={[
                  <Cell key="label">{s.label}</Cell>,
                  <ColorSwatch key="color" hex={s.colour} />,
                  <Num key="cap">{s.capacity}</Num>,
                ]}
              />
            ))}
          />
        )}
      </Section>
    </div>
  );
}

/* ============================================
   Inline render helpers — kept local to keep the surface
   self-contained. Reach for these in §8b4+ if other inventory
   surfaces want the same shape.
   ============================================ */

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h4
        className="text-[10px] font-bold uppercase tracking-wider"
        style={{
          marginBottom: 'var(--lp-space-2)',
          color: 'var(--lp-text-tertiary)',
        }}
      >
        {title}
      </h4>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: 'var(--lp-space-3)',
        fontSize: 'var(--lp-text-xs)',
        color: 'var(--lp-text-tertiary)',
        fontStyle: 'italic',
        textAlign: 'center',
        border: '1px dashed var(--lp-border)',
        borderRadius: 'var(--lp-radius-md)',
        background: 'var(--lp-surface)',
      }}
    >
      {children}
    </div>
  );
}

/* Pass colTemplate down via a CSS custom property so each
   Row mirrors the header's grid alignment without duplicating
   the template string per usage. The "--cols" custom prop is
   read by Row's inline style. */
function Table({
  colTemplate,
  head,
  rows,
}: {
  colTemplate: string;
  head: string[];
  rows: React.ReactNode;
}) {
  return (
    <div
      className="rounded-md border overflow-hidden"
      style={{
        borderColor: 'var(--lp-border)',
        background: 'var(--lp-surface)',
        ['--cols' as string]: colTemplate,
      } as React.CSSProperties}
    >
      <div
        className="grid items-center text-[10px] font-bold uppercase tracking-wider border-b"
        style={{
          gridTemplateColumns: 'var(--cols)',
          padding: 'var(--lp-space-2) var(--lp-space-3)',
          borderColor: 'var(--lp-border)',
          color: 'var(--lp-text-tertiary)',
          background: 'var(--lp-panel)',
        }}
      >
        {head.map((h, i) => (
          <div key={`${h}-${i}`}>{h}</div>
        ))}
      </div>
      <div>{rows}</div>
    </div>
  );
}

function Row({ cols }: { cols: React.ReactNode[] }) {
  return (
    <div
      className="grid items-center border-b last:border-b-0"
      style={{
        gridTemplateColumns: 'var(--cols)',
        padding: 'var(--lp-space-2) var(--lp-space-3)',
        borderColor: 'var(--lp-border-light)',
        fontSize: 'var(--lp-text-xs)',
        color: 'var(--lp-text)',
      }}
    >
      {cols.map((c, i) => (
        <div key={i} className="min-w-0">
          {c}
        </div>
      ))}
    </div>
  );
}

function Num({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="font-mono tabular-nums"
      style={{ color: 'var(--lp-text)', fontWeight: 'var(--lp-weight-semibold)' }}
    >
      {children}
    </span>
  );
}

function Cell({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <span
      style={{
        color: muted ? 'var(--lp-text-tertiary)' : 'var(--lp-text)',
        fontStyle: muted ? 'italic' : 'normal',
      }}
    >
      {children}
    </span>
  );
}

function ColorSwatch({ hex }: { hex: string }) {
  return (
    <span className="inline-flex items-center" style={{ gap: 6 }}>
      <span
        aria-hidden
        style={{
          width: 12,
          height: 12,
          borderRadius: 3,
          background: hex,
          border: '1px solid var(--lp-border)',
        }}
      />
      <span style={{ fontFamily: 'var(--lp-font-mono)', fontSize: '10px', color: 'var(--lp-text-secondary)' }}>
        {hex}
      </span>
    </span>
  );
}

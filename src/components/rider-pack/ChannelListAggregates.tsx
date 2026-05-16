'use client';

/* ============================================
   LOWPASS — <ChannelListAggregates> (Sprint 12 §8b1)

   Five inventory aggregate sub-tables rendered beneath the
   channel grid. Computed at render time from the channel
   rows + stage_boxes + sub_snakes — no separate edit surface,
   no persisted state. The operator's edits to channel rows
   re-flow these tables on the next render.

   Sub-tables:
     1. Microphones / DIs   grouped by name × provider
     2. Mic stands          grouped by stand label
     3. Cables              grouped by cable_length value
     4. Stage boxes         from stage_boxes table
     5. Snakes / Looms      from sub_snakes table

   Token discipline: all colours via var(--lp-…). The provider
   pills mirror the existing channel-row provider tones.

   §8b2 will add the per-aggregate notes column (stored as
   JSONB on the section's metadata). For now the mic+DI
   aggregate is read-only — the operator adjusts counts by
   editing channel rows.
   ============================================ */

import { useMemo } from 'react';
import type { ChannelListRow, StageBox, SubSnake } from '@/lib/rider-packs/types';
import {
  aggregateMicsByProvider,
  aggregateStands,
  aggregateCables,
  aggregateStageBoxes,
  aggregateSubSnakes,
} from '@/lib/rider-packs/aggregates';

interface ChannelListAggregatesProps {
  rows: ChannelListRow[];
  stageBoxes: StageBox[];
  subSnakes: SubSnake[];
}

const SECTION_LABEL: React.CSSProperties = {
  fontSize: 'var(--lp-text-2xs)',
  fontWeight: 'var(--lp-weight-semibold)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--lp-text-tertiary)',
  marginBottom: 'var(--lp-space-2)',
};

const TABLE_BASE: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'separate',
  borderSpacing: 0,
  fontSize: 'var(--lp-text-xs)',
  color: 'var(--lp-text)',
};

const TH: React.CSSProperties = {
  textAlign: 'left',
  padding: 'var(--lp-space-1) var(--lp-space-2)',
  fontSize: 'var(--lp-text-2xs)',
  fontWeight: 'var(--lp-weight-semibold)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--lp-text-tertiary)',
  borderBottom: '1px solid var(--lp-border)',
  background: 'var(--lp-bg-secondary)',
};

const TD: React.CSSProperties = {
  padding: 'var(--lp-space-1) var(--lp-space-2)',
  borderBottom: '1px solid var(--lp-border-light, var(--lp-border))',
};

const PROVIDER_TONE: Record<
  'band' | 'venue' | 'hire' | 'unspecified',
  { fg: string; bg: string; border: string; label: string }
> = {
  band: {
    fg: 'var(--color-lp-orange)',
    bg: '#FF45001a',
    border: '#FF450055',
    label: 'BAND',
  },
  venue: {
    fg: '#1d4ed8',
    bg: '#1d4ed81a',
    border: '#1d4ed855',
    label: 'VENUE',
  },
  hire: {
    fg: '#7c3aed',
    bg: '#7c3aed1a',
    border: '#7c3aed55',
    label: 'HIRE',
  },
  unspecified: {
    fg: 'var(--lp-text-tertiary)',
    bg: 'transparent',
    border: 'var(--lp-border)',
    label: '—',
  },
};

function ProviderPill({
  provider,
}: {
  provider: 'band' | 'venue' | 'hire' | 'unspecified';
}) {
  const tone = PROVIDER_TONE[provider];
  return (
    <span
      className="inline-flex items-center"
      style={{
        padding: '1px 6px',
        fontSize: '10px',
        fontWeight: 'var(--lp-weight-semibold)',
        color: tone.fg,
        backgroundColor: tone.bg,
        border: `1px solid ${tone.border}`,
        borderRadius: 999,
        letterSpacing: '0.05em',
      }}
    >
      {tone.label}
    </span>
  );
}

export function ChannelListAggregates({
  rows,
  stageBoxes,
  subSnakes,
}: ChannelListAggregatesProps) {
  const mics = useMemo(() => aggregateMicsByProvider(rows), [rows]);
  const stands = useMemo(() => aggregateStands(rows), [rows]);
  const cables = useMemo(() => aggregateCables(rows), [rows]);
  const boxes = useMemo(() => aggregateStageBoxes(stageBoxes), [stageBoxes]);
  const snakes = useMemo(() => aggregateSubSnakes(subSnakes), [subSnakes]);

  /* Render-time guard — if every aggregate is empty, hide the
     whole section so an unfilled channel list doesn't get a
     wall of "(none)" sub-tables. */
  const allEmpty =
    mics.length === 0 &&
    stands.length === 0 &&
    cables.length === 0 &&
    boxes.length === 0 &&
    snakes.length === 0;

  if (allEmpty) {
    return null;
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: 'var(--lp-space-4)',
        padding: 'var(--lp-space-4)',
        borderTop: '1px solid var(--lp-border)',
        background: 'var(--lp-bg)',
      }}
    >
      {/* Microphones / DIs */}
      {mics.length > 0 && (
        <section>
          <div style={SECTION_LABEL}>Microphones / DIs</div>
          <table style={TABLE_BASE}>
            <thead>
              <tr>
                <th style={{ ...TH, width: 40, textAlign: 'right' }}>QTY</th>
                <th style={TH}>Item</th>
                <th style={{ ...TH, width: 64 }}>Provider</th>
              </tr>
            </thead>
            <tbody>
              {mics.map((row, idx) => (
                <tr key={`${row.item}-${row.provider}-${idx}`}>
                  <td style={{ ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 'var(--lp-weight-semibold)' }}>
                    {row.qty}
                  </td>
                  <td style={TD}>{row.item}</td>
                  <td style={TD}>
                    <ProviderPill provider={row.provider} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Stands */}
      {stands.length > 0 && (
        <section>
          <div style={SECTION_LABEL}>Mic stands</div>
          <table style={TABLE_BASE}>
            <thead>
              <tr>
                <th style={{ ...TH, width: 40, textAlign: 'right' }}>QTY</th>
                <th style={TH}>Item</th>
              </tr>
            </thead>
            <tbody>
              {stands.map((row) => (
                <tr key={row.item}>
                  <td style={{ ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 'var(--lp-weight-semibold)' }}>
                    {row.qty}
                  </td>
                  <td style={TD}>{row.item}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Cables */}
      {cables.length > 0 && (
        <section>
          <div style={SECTION_LABEL}>Cables</div>
          <table style={TABLE_BASE}>
            <thead>
              <tr>
                <th style={{ ...TH, width: 40, textAlign: 'right' }}>QTY</th>
                <th style={TH}>Length</th>
              </tr>
            </thead>
            <tbody>
              {cables.map((row) => (
                <tr key={row.length}>
                  <td style={{ ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 'var(--lp-weight-semibold)' }}>
                    {row.qty}
                  </td>
                  <td style={{ ...TD, fontVariantNumeric: 'tabular-nums' }}>{row.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Stage boxes */}
      {boxes.length > 0 && (
        <section>
          <div style={SECTION_LABEL}>Stage boxes</div>
          <table style={TABLE_BASE}>
            <thead>
              <tr>
                <th style={TH}>Name</th>
                <th style={{ ...TH, width: 48, textAlign: 'right' }}>Pos</th>
                <th style={{ ...TH, width: 56, textAlign: 'right' }}>Cap</th>
              </tr>
            </thead>
            <tbody>
              {boxes.map((box) => (
                <tr key={box.id}>
                  <td style={TD}>
                    <span
                      className="inline-flex items-center"
                      style={{ gap: 6 }}
                    >
                      <span
                        aria-hidden
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 999,
                          background: box.colour,
                          border: '1px solid var(--lp-border)',
                          flexShrink: 0,
                        }}
                      />
                      {box.label}
                    </span>
                  </td>
                  <td style={{ ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--lp-text-secondary)' }}>
                    {box.position + 1}
                  </td>
                  <td style={{ ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--lp-text-secondary)' }}>
                    {box.capacity}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Snakes / Looms */}
      {snakes.length > 0 && (
        <section>
          <div style={SECTION_LABEL}>Snakes / Looms</div>
          <table style={TABLE_BASE}>
            <thead>
              <tr>
                <th style={TH}>Label</th>
                <th style={{ ...TH, width: 48, textAlign: 'right' }}>Pos</th>
                <th style={{ ...TH, width: 56, textAlign: 'right' }}>Cap</th>
              </tr>
            </thead>
            <tbody>
              {snakes.map((snake) => (
                <tr key={snake.id}>
                  <td style={TD}>
                    <span
                      className="inline-flex items-center"
                      style={{ gap: 6 }}
                    >
                      <span
                        aria-hidden
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 999,
                          background: snake.colour,
                          border: '1px solid var(--lp-border)',
                          flexShrink: 0,
                        }}
                      />
                      {snake.label}
                    </span>
                  </td>
                  <td style={{ ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--lp-text-secondary)' }}>
                    {snake.position + 1}
                  </td>
                  <td style={{ ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--lp-text-secondary)' }}>
                    {snake.capacity}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

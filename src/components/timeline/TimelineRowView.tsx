'use client';

import { buildRowItemLayouts } from './layoutItems';
import { TimelineItemCard } from './TimelineItemCard';
import type { TimelineRow } from './types';

const LABEL_W = 140;

type TimelineRowViewProps<T> = {
  row: TimelineRow<T>;
  dayWidth: number;
  days: string[];
  dayToIndex: Map<string, number>;
  /** Layout window: only show items that overlap [vs,ve] in day index */
  vs: number;
  ve: number;
};

export function TimelineRowView<T>({
  row,
  dayWidth,
  days,
  dayToIndex,
  vs,
  ve,
}: TimelineRowViewProps<T>) {
  if (row.collapsed) {
    return (
      <div
        className="flex items-center border-b"
        style={{ borderColor: 'var(--lp-border-light)', minHeight: 40 }}
      >
        <div
          className="shrink-0 text-xs font-semibold"
          style={{
            width: LABEL_W,
            padding: 'var(--lp-space-2) var(--lp-space-3)',
            color: 'var(--lp-text-secondary)',
          }}
        >
          {row.label} (hidden)
        </div>
      </div>
    );
  }

  const { layouts, rowH } = buildRowItemLayouts(row.items, dayToIndex, days);
  const h = row.height ?? rowH;
  const totalW = days.length * dayWidth;
  const visibleLayouts = layouts.filter(
    (L) => !(L.left + L.width - 1 < vs || L.left > ve)
  );
  const RowIcon = row.icon;

  return (
    <div className="flex border-b" style={{ borderColor: 'var(--lp-border-light)' }}>
      <div
        className="group sticky left-0 z-10 flex shrink-0 items-center gap-1 border-r text-xs font-semibold"
        style={{
          width: LABEL_W,
          minWidth: LABEL_W,
          padding: 'var(--lp-space-2) var(--lp-space-3)',
          color: 'var(--lp-text)',
          background: 'var(--lp-bg)',
          borderColor: 'var(--lp-border)',
        }}
      >
        {RowIcon && <RowIcon className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--lp-text-tertiary)' }} />}
        <span className="truncate uppercase" style={{ letterSpacing: 'var(--lp-tracking-caps)' }}>
          {row.label}
        </span>
      </div>
      <div
        className="relative"
        style={{
          width: totalW,
          minWidth: totalW,
          minHeight: h,
          backgroundImage: `repeating-linear-gradient(90deg, var(--lp-border-light) 0, var(--lp-border-light) 1px, transparent 1px, transparent ${dayWidth}px)`,
        }}
      >
        {visibleLayouts.map((L) => {
          const leftPx = L.left * dayWidth;
          const wPx = L.width * dayWidth;
          return (
            <TimelineItemCard
              key={L.id}
              leftPx={leftPx}
              widthPx={wPx - 1}
              topPx={L.top}
              color={L.color}
              onClick={L.onClick}
            >
              {L.render(L.data)}
            </TimelineItemCard>
          );
        })}
      </div>
    </div>
  );
}

export { LABEL_W };

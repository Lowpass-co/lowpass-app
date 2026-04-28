import type { TimelineItem } from './types';

const CARD_LANE = 32; // vertical space per lane
const PADDING = 4;
const CARD_BLOCK = 28; // one card height

type Indexed<T> = TimelineItem<T> & {
  _si: number;
  _ei: number;
};

/** Assign non-overlapping vertical lanes in [0..n) for same-row items. */
export function assignItemLanes<T>(items: Indexed<T>[], maxLanes = 4): (Indexed<T> & { lane: number })[] {
  // Sort by start index, then by span length
  const sorted = [...items].sort((a, b) => a._si - b._si || b._ei - a._si - (a._ei - a._si));
  const laneEnd: number[] = [];

  return sorted.map((it) => {
    let lane = 0;
    for (; lane < maxLanes; lane++) {
      const end = laneEnd[lane];
      if (end === undefined || it._si > end) {
        laneEnd[lane] = it._ei;
        return { ...it, lane };
      }
    }
    lane = maxLanes - 1;
    laneEnd[lane] = Math.max(laneEnd[lane] ?? -1, it._ei);
    return { ...it, lane };
  });
}

export function buildRowItemLayouts<T>(
  items: TimelineItem<T>[],
  dayToIndex: Map<string, number>,
  days: string[]
): { layouts: (TimelineItem<T> & { left: number; width: number; top: number; rowH: number })[]; rowH: number } {
  const n = days.length;
  if (n === 0) return { layouts: [], rowH: 44 };
  const indexed: Indexed<T>[] = [];
  for (const it of items) {
    const si = dayToIndex.get(it.startDate);
    const ei = dayToIndex.get(it.endDate);
    if (si === undefined || ei === undefined || si < 0 || ei < si) continue;
    indexed.push({ ...it, _si: si, _ei: Math.min(ei, n - 1) });
  }
  const withLanes = assignItemLanes(indexed);
  const maxLane = withLanes.length ? Math.max(0, ...withLanes.map((x) => x.lane)) : 0;
  const rowH = Math.max(44, PADDING * 2 + (maxLane + 1) * CARD_LANE);
  const layouts = withLanes.map((it) => ({
    id: it.id,
    startDate: it.startDate,
    endDate: it.endDate,
    data: it.data,
    render: it.render,
    color: it.color,
    onClick: it.onClick,
    left: it._si,
    width: it._ei - it._si + 1,
    top: PADDING + it.lane * CARD_LANE,
    rowH,
  }));
  return { layouts, rowH };
}

export { CARD_LANE, PADDING, CARD_BLOCK };

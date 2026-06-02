/* ============================================
   LOWPASS — Stage Plot editor dev harness (§SP2b/§SP3)

   Full editor (palette · canvas · properties) backed by
   localStorage so it is testable without the DB/auth. The
   production editor reuses <StagePlotEditor> with API
   persistence. Dev-gated: 404 in production.
   ============================================ */
'use client';

import { useEffect, useState } from 'react';
import { StagePlotEditor } from '@/components/stage-plot/StagePlotEditor';
import { DEFAULT_PLOT, type Channel, type EditorItem, type EditorPlot } from '@/lib/stage-plot/editor-types';

const KEY = 'lp:stage-plot-editor:dev';

// Sample channel list (§SP4) so linking is testable without the DB.
// Colours mimic sub-snakes A/B/C/D.
const MOCK_CHANNELS: Channel[] = [
  { id: 'c1', number: 1, label: 'Kick', color: '#ef4444', snakeLabel: 'A' },
  { id: 'c2', number: 2, label: 'Snare', color: '#ef4444', snakeLabel: 'A' },
  { id: 'c3', number: 3, label: 'Hi-hat', color: '#ef4444', snakeLabel: 'A' },
  { id: 'c4', number: 4, label: 'OH L', color: '#3b82f6', snakeLabel: 'B' },
  { id: 'c5', number: 5, label: 'OH R', color: '#3b82f6', snakeLabel: 'B' },
  { id: 'c6', number: 6, label: 'Bass DI', color: '#22c55e', snakeLabel: 'C' },
  { id: 'c7', number: 7, label: 'Gtr 1', color: '#22c55e', snakeLabel: 'C' },
  { id: 'c8', number: 8, label: 'Lead Vox', color: '#a855f7', snakeLabel: 'D' },
  { id: 'c9', number: 9, label: 'BV 1', color: '#a855f7', snakeLabel: 'D' },
];

export default function StagePlotEditorPage() {
  const [data, setData] = useState<{ plot: EditorPlot; items: EditorItem[] } | null>(null);

  useEffect(() => {
    let next = { plot: DEFAULT_PLOT, items: [] as EditorItem[] };
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        next = { plot: { ...DEFAULT_PLOT, ...parsed.plot }, items: parsed.items ?? [] };
      }
    } catch {
      /* ignore */
    }
    // Client-only localStorage load on mount — intentional setState.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(next);
  }, []);

  if (process.env.NODE_ENV === 'production') return null;
  if (!data) return null;

  return (
    <div style={{ height: '100vh' }}>
      <StagePlotEditor
        initialPlot={data.plot}
        initialItems={data.items}
        channels={MOCK_CHANNELS}
        onChange={(plot, items) => {
          try {
            localStorage.setItem(KEY, JSON.stringify({ plot, items }));
          } catch {
            /* ignore quota */
          }
        }}
      />
    </div>
  );
}

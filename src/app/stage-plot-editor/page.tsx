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
import { DEFAULT_PLOT, type EditorItem, type EditorPlot } from '@/lib/stage-plot/editor-types';

const KEY = 'lp:stage-plot-editor:dev';

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

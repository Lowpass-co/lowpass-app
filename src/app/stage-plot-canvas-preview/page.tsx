/* ============================================
   LOWPASS — Stage canvas dev harness (§SP2a)

   Renders <StageCanvas> with a mock 24x16 ft band setup to verify
   the render surface (grid, stage, rulers, cardinals, AUDIENCE,
   items, pan/zoom). Dev-gated: 404 in production.
   ============================================ */
'use client';

import { StageCanvas, type CanvasItem } from '@/components/stage-plot/StageCanvas';

const ITEMS: CanvasItem[] = [
  // Drum kit + drummer, upstage centre
  { id: '1', iconName: 'drum-kit-2t1f', xFt: 12, yFt: 4 },
  { id: '2', iconName: 'person-male', xFt: 12, yFt: 1.5 },
  // Backline
  { id: '3', iconName: 'amp-marshall-stack', xFt: 4, yFt: 3, rotationDeg: 0 },
  { id: '4', iconName: 'amp-ampeg-svt', xFt: 20, yFt: 3 },
  { id: '5', iconName: 'keys-stage-88', xFt: 19, yFt: 8 },
  // Front line — performers + vocal mics
  { id: '6', iconName: 'person-female', xFt: 8, yFt: 11 },
  { id: '7', iconName: 'mic-vocal', xFt: 8, yFt: 13.5 },
  { id: '8', iconName: 'string-electric-guitar', xFt: 5, yFt: 10 },
  { id: '9', iconName: 'person-male', xFt: 16, yFt: 11 },
  { id: '10', iconName: 'mic-vocal', xFt: 16, yFt: 13.5 },
  // Monitors at the downstage edge
  { id: '11', iconName: 'monitor-wedge', xFt: 8, yFt: 15 },
  { id: '12', iconName: 'monitor-wedge', xFt: 16, yFt: 15 },
  { id: '13', iconName: 'monitor-wedge', xFt: 12, yFt: 15 },
  // DI + power
  { id: '14', iconName: 'signal-di-stereo', xFt: 18, yFt: 10 },
  { id: '15', iconName: 'infra-power-4', xFt: 2, yFt: 6 },
];

export default function StageCanvasPreviewPage() {
  if (process.env.NODE_ENV === 'production') return null;
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--lp-bg)' }}>
      <div style={{ padding: '12px 20px', color: 'var(--lp-text)', borderBottom: '1px solid var(--lp-border)' }}>
        <div style={{ fontSize: 'var(--lp-text-lg)', fontWeight: 700 }}>Stage canvas — §SP2a</div>
        <div style={{ fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-secondary)' }}>
          24×16 ft · scroll to zoom, drag to pan
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <StageCanvas widthFt={24} depthFt={16} gridSizeFt={1} items={ITEMS} brandColor="#2563EB" />
      </div>
    </div>
  );
}

'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type WheelEvent,
  type MouseEvent,
} from 'react';
import { cn } from '@/lib/utils';
import type { DocumentCanvasBuilderProps } from './types';

const ZOOMS = [0.5, 0.75, 1, 1.5, 2];

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function nearestZoom(z: number): number {
  return ZOOMS.reduce((p, c) => (Math.abs(c - z) < Math.abs(p - z) ? c : p), 1);
}

export function DocumentCanvasBuilder({
  aspectRatio = 16 / 9,
  zoom: controlledZoom,
  onZoomChange,
  showGrid = false,
  children,
  className,
  minHeight = 'min(70vh, 560px)',
}: DocumentCanvasBuilderProps) {
  const [uncontrolled, setUncontrolled] = useState(1);
  const isControlled = controlledZoom !== undefined;
  const zoom = isControlled ? controlledZoom! : uncontrolled;
  const setZoom = useCallback(
    (z: number) => {
      const nz = nearestZoom(clamp(z, 0.25, 2.5));
      if (onZoomChange) onZoomChange(nz);
      else setUncontrolled(nz);
    },
    [onZoomChange]
  );

  const applyZoom = useCallback(
    (factor: number) => {
      const z = (isControlled ? controlledZoom! : uncontrolled) * factor;
      setZoom(z);
    },
    [controlledZoom, isControlled, uncontrolled, setZoom]
  );

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [space, setSpace] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0, px: 0, py: 0 });
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && (e.target as HTMLElement)?.tagName !== 'INPUT') {
        if (e.repeat) return;
        setSpace(e.type === 'keydown');
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    };
  }, []);

  const onWheel = useCallback(
    (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const delta = -e.deltaY * 0.001;
      applyZoom(1 + delta);
    },
    [applyZoom]
  );

  const onMouseDown = useCallback(
    (e: MouseEvent) => {
      if (e.button === 1 || (e.button === 0 && space)) {
        e.preventDefault();
        setDragging(true);
        panStart.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
      }
    },
    [space, pan]
  );

  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragging) return;
      setPan({
        x: panStart.current.px + (e.clientX - panStart.current.x),
        y: panStart.current.py + (e.clientY - panStart.current.y),
      });
    },
    [dragging]
  );

  const onMouseUp = useCallback(() => setDragging(false), []);

  const fit = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [setZoom]);

  const gridStyle = useMemo((): CSSProperties => {
    if (!showGrid) return {};
    return {
      backgroundImage: `radial-gradient(circle, var(--lp-border-light) 0.5px, transparent 0.6px)`,
      backgroundSize: '8px 8px',
    };
  }, [showGrid]);

  return (
    <div
      className={cn('relative flex min-h-0 flex-1 flex-col', className)}
      style={{ minHeight, background: 'var(--lp-bg-secondary)' }}
    >
      <div
        ref={viewportRef}
        className="relative min-h-0 flex-1 overflow-hidden p-4"
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        style={{ cursor: space || dragging ? 'grabbing' : 'default' }}
      >
        <div className="flex h-full w-full items-center justify-center">
          <div
            className="relative w-full"
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              aspectRatio,
            }}
          >
            <div
              ref={canvasRef}
              className="relative h-full w-full overflow-hidden"
              style={{
                border: '1px solid var(--lp-border)',
                borderRadius: 'var(--lp-radius-lg, 0.75rem)',
                background: 'var(--lp-bg)',
                boxShadow: 'var(--lp-shadow-sm)',
                ...gridStyle,
              }}
            >
              <div
                className="relative h-full w-full"
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: 'center center',
                }}
              >
                {children}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div
        className="absolute bottom-3 right-3 z-20 flex items-center gap-1 rounded-md border p-0.5 text-xs"
        style={{
          background: 'var(--lp-surface)',
          borderColor: 'var(--lp-border)',
          color: 'var(--lp-text)',
        }}
      >
        <button
          type="button"
          className="rounded px-2 py-1 font-medium hover:opacity-90"
          style={{ color: 'var(--lp-text)' }}
          onClick={() => applyZoom(1 / 1.1)}
        >
          −
        </button>
        <button
          type="button"
          className="min-w-14 rounded px-2 py-1 font-mono text-[11px]"
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          className="rounded px-2 py-1 font-medium"
          onClick={() => applyZoom(1.1)}
        >
          +
        </button>
        <button
          type="button"
          className="rounded px-2 py-1 text-[11px] font-medium"
          onClick={fit}
        >
          Fit
        </button>
      </div>
    </div>
  );
}

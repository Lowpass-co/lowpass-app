'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import type { DocumentCanvasProseProps } from './types';

function pickMostVisible(entries: IntersectionObserverEntry[]): string | null {
  if (entries.length === 0) return null;
  const best = entries
    .filter((e) => e.isIntersecting)
    .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
  if (best) {
    return best.target.id;
  }
  // Fallback: first with any visibility
  const any = entries.find((e) => e.intersectionRatio > 0);
  return any?.target.id ?? null;
}

export function DocumentCanvasProse({
  sections,
  activeSection: _activeSection,
  onSectionChange,
  editable: _editable,
  children,
  className,
  maxHeight = 'min(70vh, 640px)',
  surface = false,
}: DocumentCanvasProseProps) {
  void _activeSection; // parent may sync rail highlight; scroll is driven by hash or app logic
  void _editable; // v1: consumer can mark paragraphs contentEditable in children
  const rootRef = useRef<HTMLDivElement | null>(null);

  const obsRef = useRef<IntersectionObserver | null>(null);
  useEffect(() => {
    if (!onSectionChange) return;
    let cancelled = false;
    const t = requestAnimationFrame(() => {
      obsRef.current?.disconnect();
      if (cancelled) return;
      const root = rootRef.current;
      if (!root) return;
      const ids = sections.map((s) => s.id);
      const elements = ids
        .map((id) => document.getElementById(id))
        .filter((e): e is HTMLElement => e !== null);
      if (elements.length === 0) return;

      const obs = new IntersectionObserver(
        (entries) => {
          const id = pickMostVisible(entries);
          if (id) onSectionChange(id);
        },
        { root, rootMargin: '-40% 0px -45% 0px', threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] }
      );
      obsRef.current = obs;
      for (const el of elements) obs.observe(el);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(t);
      obsRef.current?.disconnect();
      obsRef.current = null;
    };
  }, [sections, onSectionChange]);

  return (
    <div
      ref={rootRef}
      className={cn('min-h-0 overflow-y-auto', className)}
      style={{
        maxHeight,
        background: 'var(--lp-bg)',
        paddingTop: 'var(--lp-space-12)',
      }}
    >
      <div
        // UX22 cleanup P2 — opt-in `surface` wraps prose content in an
        // lp-surface card so the read view doesn't sit on a dark void.
        // Print stylesheet (next sibling <style>) drops the surface so
        // printouts stay clean.
        className={cn(
          'prose-canvas-content mx-auto w-full',
          '[&_h1]:mb-4 [&_h1]:[font-size:var(--lp-text-3xl)] [&_h1]:[font-weight:600] [&_h1]:[color:var(--lp-text)]',
          '[&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:[font-size:var(--lp-text-2xl)] [&_h2]:[font-weight:600]',
          '[&_h3]:[font-size:var(--lp-text-xl)] [&_h3]:[font-weight:600]',
          '[&_h4]:[font-size:var(--lp-text-lg)] [&_h4]:[font-weight:600]',
          '[&_p]:[font-size:var(--lp-text-base)] [&_p]:[line-height:var(--lp-leading-relaxed)] [&_p]:[color:var(--lp-text)]',
          '[&_blockquote]:[border-left:3px_solid_var(--lp-border)]',
          '[&_ul]:[list-style:disc] [&_ul]:pl-5',
          surface && 'lp-prose-surface',
        )}
        style={
          surface
            ? {
                maxWidth: 720,
                background: 'var(--lp-surface)',
                border: '1px solid var(--lp-border)',
                borderRadius: 'var(--lp-radius-lg, 8px)',
                padding: 'var(--lp-space-8, 32px) var(--lp-space-6, 24px)',
                margin: '0 auto var(--lp-space-6, 24px) auto',
              }
            : { maxWidth: 720, padding: '0 var(--lp-space-4)' }
        }
      >
        {children}
      </div>
      {surface ? (
        <style>{`
          @media print {
            .lp-prose-surface {
              background: transparent !important;
              border: 0 !important;
              border-radius: 0 !important;
              padding: 0 !important;
              margin: 0 auto !important;
            }
          }
        `}</style>
      ) : null}
    </div>
  );
}

'use client';

/* ============================================
   LOWPASS — <Tooltip> (Sprint 9 §14.8)

   Lightweight hover/focus tooltip. Replaces native title=""
   attributes app-wide so we get a token-driven dark surface
   instead of the OS browser tooltip.

   Behaviour:
     - Wraps a single child (button, span, etc.). Inherits the
       child's bounding box for positioning.
     - Shows on mouse enter / focus, hides on leave / blur.
     - 200ms open delay so quick mouse-over doesn't fire it.
     - Positioned above the trigger by default (`side="top"`),
       with a small arrow-less gap. Other sides supported for
       layouts where "top" overflows the viewport.
     - SSR-safe: portal to document.body only after first
       client-side render.

   Multi-line content: pass a ReactNode as `content` to render
   structured tooltip bodies (e.g. lists). For a simple string
   the component handles wrapping at ~280px.
   ============================================ */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export type TooltipSide = 'top' | 'bottom' | 'left' | 'right';

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: TooltipSide;
  /** Delay before the tooltip appears, ms. Default 200. */
  openDelay?: number;
  /** Disable the tooltip without unwrapping the child. */
  disabled?: boolean;
  /** Override the wrapping span's class. The wrapper has
   *  `display: inline-flex` by default to track the child's
   *  size; pass `block` etc. via this prop if needed. */
  className?: string;
}

const SIDE_OFFSET = 8;

function computePosition(
  trigger: DOMRect,
  panel: DOMRect,
  side: TooltipSide,
): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let top = 0;
  let left = 0;
  switch (side) {
    case 'top':
      top = trigger.top - panel.height - SIDE_OFFSET;
      left = trigger.left + trigger.width / 2 - panel.width / 2;
      break;
    case 'bottom':
      top = trigger.bottom + SIDE_OFFSET;
      left = trigger.left + trigger.width / 2 - panel.width / 2;
      break;
    case 'left':
      top = trigger.top + trigger.height / 2 - panel.height / 2;
      left = trigger.left - panel.width - SIDE_OFFSET;
      break;
    case 'right':
      top = trigger.top + trigger.height / 2 - panel.height / 2;
      left = trigger.right + SIDE_OFFSET;
      break;
  }
  // Clamp to viewport so the tooltip never paints offscreen.
  if (left < 4) left = 4;
  if (left + panel.width > vw - 4) left = vw - panel.width - 4;
  if (top < 4) top = 4;
  if (top + panel.height > vh - 4) top = vh - panel.height - 4;
  return { top, left };
}

export function Tooltip({
  content,
  children,
  side = 'top',
  openDelay = 200,
  disabled = false,
  className,
}: TooltipProps) {
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Mount-detect for SSR portal gating: createPortal needs
    // document.body which doesn't exist server-side. The effect
    // intentionally flips state once on first client paint;
    // it's not synchronizing with external state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const open = () => {
    if (disabled) return;
    if (openTimerRef.current) clearTimeout(openTimerRef.current);
    openTimerRef.current = setTimeout(() => setVisible(true), openDelay);
  };
  const close = () => {
    if (openTimerRef.current) clearTimeout(openTimerRef.current);
    setVisible(false);
  };

  // Position the panel against the trigger after it mounts.
  useEffect(() => {
    if (!visible || !wrapperRef.current || !panelRef.current) return;
    const trigger = wrapperRef.current.getBoundingClientRect();
    const panel = panelRef.current.getBoundingClientRect();
    setPos(computePosition(trigger, panel, side));
  }, [visible, side, content]);

  useEffect(() => {
    return () => {
      if (openTimerRef.current) clearTimeout(openTimerRef.current);
    };
  }, []);

  return (
    <span
      ref={wrapperRef}
      onMouseEnter={open}
      onMouseLeave={close}
      onFocus={open}
      onBlur={close}
      className={className ?? 'inline-flex'}
    >
      {children}
      {mounted && visible
        ? createPortal(
            <div
              ref={panelRef}
              role="tooltip"
              style={{
                position: 'fixed',
                top: pos?.top ?? -9999,
                left: pos?.left ?? -9999,
                zIndex: 'var(--lp-z-tooltip, 9000)',
                maxWidth: 280,
                padding: '6px 10px',
                fontSize: 'var(--lp-text-xs)',
                lineHeight: 1.35,
                color: 'var(--lp-bg)',
                background: 'var(--lp-text)',
                borderRadius: 'var(--lp-radius-sm)',
                boxShadow: 'var(--lp-shadow-md, 0 4px 12px rgba(0, 0, 0, 0.18))',
                pointerEvents: 'none',
                opacity: pos === null ? 0 : 1,
                transition: 'opacity 120ms ease-out',
              }}
            >
              {content}
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}

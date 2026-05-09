'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const MOBILE_MAX = 639;

function useIsMobile(): boolean {
  const [m, setM] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(`(max-width: ${MOBILE_MAX}px)`).matches : false
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_MAX}px)`);
    const fn = () => setM(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return m;
}

function getTabbable(root: HTMLElement): HTMLElement[] {
  const nodes = root.querySelectorAll<HTMLElement>(
    [
      'a[href]:not([tabindex="-1"])',
      'button:not([disabled]):not([tabindex="-1"])',
      'input:not([disabled]):not([type="hidden"]):not([tabindex="-1"])',
      'select:not([disabled]):not([tabindex="-1"])',
      'textarea:not([disabled]):not([tabindex="-1"])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',')
  );
  return Array.from(nodes).filter((el) => {
    if (el.getAttribute('aria-hidden') === 'true') return false;
    return el.getClientRects().length > 0;
  });
}

export type SlideOverProps = {
  open: boolean;
  onClose: () => void;
  onExitComplete?: () => void;
  title: string;
  /** Optional row above the title (e.g. status chips). */
  headerStart?: ReactNode;
  subtitle?: ReactNode;
  headerActions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: 'default' | 'wide' | 'xwide';
  /** Default `false` — page remains visible; opt in for high-stakes flows. */
  backdrop?: boolean;
  ariaLabel?: string;
};

const TITLE_ID = 'slide-over-title';

export function SlideOver({
  open,
  onClose,
  onExitComplete,
  title,
  headerStart,
  subtitle,
  headerActions,
  children,
  footer,
  width = 'default',
  backdrop = false,
  ariaLabel,
}: SlideOverProps) {
  const isMobile = useIsMobile();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(!!open);
  const [animateIn, setAnimateIn] = useState(false);

  const widthVar =
    width === 'xwide'
      ? 'var(--lp-slideover-width-xwide)'
      : width === 'wide'
        ? 'var(--lp-slideover-width-wide)'
        : 'var(--lp-slideover-width)';

  /* Slide-over enter/exit: keep portal mounted for exit transform; raf runs enter after first paint. */
  useLayoutEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- must mount before paint when open
      setMounted(true);
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      const r = requestAnimationFrame(() => {
        setAnimateIn(true);
      });
      return () => cancelAnimationFrame(r);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- start exit when open becomes false
    setAnimateIn(false);
  }, [open]);

  const finishExit = useCallback(() => {
    setMounted(false);
    const el = previousFocusRef.current;
    if (el && document.contains(el) && typeof el.focus === 'function') {
      requestAnimationFrame(() => el.focus());
    }
    onExitComplete?.();
  }, [onExitComplete]);

  const handlePanelTransitionEnd = (e: React.TransitionEvent<HTMLDivElement>) => {
    if (e.target !== panelRef.current) return;
    if (e.propertyName !== 'transform') return;
    if (!open) finishExit();
  };

  useLayoutEffect(() => {
    if (open) {
      previousFocusRef.current = (document.activeElement as HTMLElement) ?? null;
      const t = requestAnimationFrame(() => {
        const node = panelRef.current;
        if (!node) return;
        const firstHeader = node.querySelector<HTMLElement>('[data-autofocus]');
        if (firstHeader) firstHeader.focus();
        else closeBtnRef.current?.focus();
      });
      return () => cancelAnimationFrame(t);
    }
  }, [open]);

  const onKeyDownTrap = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const list = getTabbable(panelRef.current);
      if (list.length === 0) return;
      const first = list[0]!;
      const last = list[list.length - 1]!;
      const el = e.target as HTMLElement;
      if (e.shiftKey) {
        if (el === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (el === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose]
  );

  const panelTransform = isMobile
    ? animateIn
      ? 'translateY(0)'
      : 'translateY(100%)'
    : animateIn
      ? 'translateX(0)'
      : 'translateX(100%)';

  /* Sprint 9 §12.1 — opacity rides alongside the existing
     transform animation so the panel fades in/out as it
     slides. Spec asked for both transform and opacity at the
     primitive level so every consumer (Manage personnel,
     Add personnel, Edit tour, etc.) inherits the polish for
     free. The transitionEnd handler that fires `finishExit`
     keys on `transform` so adding opacity to the transition
     list doesn't double-fire it. */
  const basePanel: React.CSSProperties = {
    zIndex: 'var(--lp-z-slide-over)',
    background: 'var(--lp-surface)',
    boxShadow: 'var(--lp-shadow-overlay)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    transform: panelTransform,
    opacity: animateIn ? 1 : 0,
    transition: `transform var(--lp-duration-slower) var(--lp-ease-emphasized), opacity var(--lp-duration-slower) var(--lp-ease-emphasized)`,
  };

  const panelStyle: React.CSSProperties = isMobile
    ? {
        ...basePanel,
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        top: 'auto',
        width: '100%',
        maxWidth: '100%',
        maxHeight: 'min(90dvh, 100%)',
        height: 'auto',
        borderTopLeftRadius: 'var(--lp-radius-xl)',
        borderTopRightRadius: 'var(--lp-radius-xl)',
      }
    : {
        ...basePanel,
        position: 'fixed',
        right: 0,
        top: 0,
        height: '100vh',
        width: widthVar,
        maxWidth: '100vw',
        borderTopLeftRadius: 'var(--lp-radius-xl)',
        borderBottomLeftRadius: 'var(--lp-radius-xl)',
        borderTopRightRadius: 0,
        borderBottomRightRadius: 0,
        borderLeft: '1px solid var(--lp-border)',
      };

  const dialogAria =
    ariaLabel !== undefined
      ? { 'aria-label': ariaLabel }
      : { 'aria-labelledby': TITLE_ID };

  const backdropNode =
    backdrop ? (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 'var(--lp-z-slide-over-backdrop)',
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(4px)',
          opacity: animateIn ? 1 : 0,
          pointerEvents: open && animateIn ? 'auto' : 'auto',
          transition: `opacity var(--lp-duration-slow) var(--lp-ease-standard)`,
        }}
        onClick={onClose}
        aria-hidden
      />
    ) : null;

  if (!mounted) return null;

  const content = (
    <>
      {backdropNode}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        {...dialogAria}
        data-slide-over
        onKeyDown={onKeyDownTrap}
        onTransitionEnd={handlePanelTransitionEnd}
        className="lp-slide-over-panel"
        style={panelStyle}
      >
        <div
          className="flex shrink-0 items-start justify-between gap-2"
          style={{
            borderBottom: '1px solid var(--lp-border)',
            padding: 'var(--lp-space-4)',
          }}
        >
          <div className="min-w-0 flex-1">
            {headerStart ? <div className="mb-2 flex flex-wrap items-center gap-2">{headerStart}</div> : null}
            <h2 id={TITLE_ID} className="text-lg font-bold" style={{ color: 'var(--lp-text)' }}>
              {title}
            </h2>
            {subtitle != null && subtitle !== '' ? (
              <div className="mt-0.5">{subtitle}</div>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {headerActions}
            <button
              ref={closeBtnRef}
              type="button"
              className="rounded-lg p-1.5"
              style={{ color: 'var(--lp-text-tertiary)' }}
              onClick={onClose}
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <div
          className="min-h-0 flex-1 overflow-y-auto"
          style={{ padding: 'var(--lp-space-4)' }}
        >
          {children}
        </div>
        {footer ? (
          <div
            className="shrink-0"
            style={{
              borderTop: '1px solid var(--lp-border)',
              padding: 'var(--lp-space-4)',
            }}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </>
  );

  return createPortal(content, document.body);
}

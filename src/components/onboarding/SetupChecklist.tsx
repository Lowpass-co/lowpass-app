'use client';

/* ============================================
   LOWPASS — "Get set up" checklist (Nov 2026)

   Bottom-right, stacked above the bug-report button. Folds to a pill with a
   progress ring. Steps tick themselves from /api/onboarding/status — there is
   nothing to click off by hand. Only the next step shows its hint and button;
   the rest stay one line, so the card never gets long.
   ============================================ */

import { Check, ChevronDown, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { progress, type ChecklistItem } from '@/lib/onboarding/checklist';

interface Props {
  items: ChecklistItem[];
  collapsed: boolean;
  onCollapse: (c: boolean) => void;
  onHide: () => void;
  onAction: (item: ChecklistItem) => void;
}

/* Above the bug button: its bottom offset + its 48px height + a gap. */
const BOTTOM = 'calc(var(--lp-space-6) + var(--lp-space-12) + var(--lp-space-3))';

export function SetupChecklist({ items, collapsed, onCollapse, onHide, onAction }: Props) {
  const { done, total, next } = progress(items);
  const complete = next === null;

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => onCollapse(false)}
        className="lp-onb-pop btn-transition fixed inline-flex items-center"
        aria-label={`Get set up: ${done} of ${total} done. Open checklist`}
        style={{
          right: 'var(--lp-space-6)', bottom: BOTTOM, zIndex: 'var(--lp-z-overlay)',
          gap: 'var(--lp-space-2)', padding: 'var(--lp-space-1) var(--lp-space-3) var(--lp-space-1) var(--lp-space-1)',
          borderRadius: 'var(--lp-radius-full)', border: '1px solid var(--lp-border-strong)', background: 'var(--lp-surface)',
          boxShadow: 'var(--lp-shadow-popover)', cursor: 'pointer', color: 'var(--lp-text)',
          fontSize: 'var(--lp-text-sm)', fontWeight: 'var(--lp-weight-medium)',
        }}
      >
        <Ring done={done} total={total} />
        {complete ? 'All set' : 'Get set up'}
        <span style={{ color: 'var(--lp-text-tertiary)', fontFamily: 'var(--lp-font-numeric)' }}>{done}/{total}</span>
      </button>
    );
  }

  return (
    <section
      aria-label="Get set up"
      className="lp-onb-rise fixed flex flex-col"
      style={{
        right: 'var(--lp-space-6)', bottom: BOTTOM, zIndex: 'var(--lp-z-overlay)',
        width: 340, maxWidth: 'calc(100vw - var(--lp-space-8))',
        borderRadius: 'var(--lp-radius-xl)', border: '1px solid var(--lp-border-strong)', background: 'var(--lp-surface)',
        boxShadow: 'var(--lp-shadow-overlay)', overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div className="flex items-center" style={{ gap: 'var(--lp-space-3)', padding: 'var(--lp-space-4) var(--lp-space-4) var(--lp-space-3)' }}>
        <Ring done={done} total={total} size={32} />
        <div className="min-w-0 flex-1">
          <div style={{ fontSize: 'var(--lp-text-base)', fontWeight: 'var(--lp-weight-semibold)', color: 'var(--lp-text)' }}>
            {complete ? 'You’re set up' : 'Get set up'}
          </div>
          <div style={{ fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-secondary)' }}>
            {complete ? 'That’s the whole loop.' : `${done} of ${total} done · ticks itself`}
          </div>
        </div>
        <IconBtn label="Fold checklist" onClick={() => onCollapse(true)}><ChevronDown size={16} /></IconBtn>
        <IconBtn label="Hide checklist" onClick={onHide}><X size={16} /></IconBtn>
      </div>

      {/* Steps */}
      <ol style={{ margin: 0, padding: '0 var(--lp-space-2) var(--lp-space-2)', listStyle: 'none' }}>
        {items.map((item) => {
          const isNext = item.id === next?.id;
          return (
            <li key={item.id}>
              <div
                className="btn-transition flex items-start"
                style={{
                  gap: 'var(--lp-space-3)', padding: 'var(--lp-space-2)', borderRadius: 'var(--lp-radius-md)',
                  background: isNext ? 'var(--lp-surface-hover)' : 'transparent',
                }}
              >
                <Dot done={item.done} next={isNext} />
                <div className="min-w-0 flex-1">
                  {isNext || item.done ? (
                    <div
                      style={{
                        fontSize: 'var(--lp-text-sm)', fontWeight: isNext ? 'var(--lp-weight-semibold)' : 'var(--lp-weight-regular)',
                        color: item.done ? 'var(--lp-text-tertiary)' : 'var(--lp-text)', lineHeight: 'var(--lp-leading-snug)',
                      }}
                    >
                      {item.title}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onAction(item)}
                      className="btn-transition text-left"
                      style={{ padding: 0, border: 0, background: 'none', cursor: 'pointer', fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)', lineHeight: 'var(--lp-leading-snug)' }}
                    >
                      {item.title}
                    </button>
                  )}
                  {isNext ? (
                    <div key={item.id} className="lp-onb-rise">
                      <p style={{ margin: 'var(--lp-space-1) 0 var(--lp-space-2)', fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-secondary)', lineHeight: 'var(--lp-leading-normal)' }}>
                        {item.hint}
                      </p>
                      <Button variant="primary" size="sm" onClick={() => onAction(item)}>{item.cta}</Button>
                    </div>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {complete ? (
        <div style={{ padding: '0 var(--lp-space-4) var(--lp-space-4)' }}>
          <Button variant="secondary" size="sm" block onClick={onHide}>Close checklist</Button>
        </div>
      ) : null}
    </section>
  );
}

function Ring({ done, total, size = 26 }: { done: number; total: number; size?: number }) {
  const stroke = 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - (total ? done / total : 0));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden style={{ flexShrink: 0, transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--lp-border-strong)" strokeWidth={stroke} />
      <circle
        className="lp-onb-ring"
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={done === total ? 'var(--color-lp-success)' : 'var(--lp-orange)'}
        strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
      />
    </svg>
  );
}

function Dot({ done, next }: { done: boolean; next: boolean }) {
  const size = 18;
  if (done) {
    return (
      <span
        className="lp-onb-pop inline-flex shrink-0 items-center justify-center"
        style={{ width: size, height: size, marginTop: 1, borderRadius: 'var(--lp-radius-full)', background: 'var(--color-lp-success)', color: 'var(--lp-surface)' }}
      >
        <Check size={12} strokeWidth={3} aria-hidden />
        <span className="sr-only">Done:</span>
      </span>
    );
  }
  return (
    <span
      className={next ? 'lp-onb-ping shrink-0' : 'shrink-0'}
      style={{
        width: size, height: size, marginTop: 1, borderRadius: 'var(--lp-radius-full)',
        border: `2px solid ${next ? 'var(--lp-orange)' : 'var(--lp-border-strong)'}`,
      }}
    />
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="btn-transition inline-flex shrink-0 items-center justify-center hover:bg-lp-surface-hover"
      style={{ width: 28, height: 28, borderRadius: 'var(--lp-radius-md)', border: 0, background: 'transparent', color: 'var(--lp-text-tertiary)', cursor: 'pointer' }}
    >
      {children}
    </button>
  );
}

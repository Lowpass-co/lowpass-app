'use client';

/* ============================================
   LOWPASS — Welcome cards (Nov 2026)

   Four cards in the shared <Modal>: an illustration, a title, two lines.
   ← / → step through; Esc or Skip closes. The last button says what happens
   next: people who can set up go on to the "Get set up" checklist.
   ============================================ */

import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { WELCOME_CARDS } from '@/lib/onboarding/checklist';
import { WelcomeArt } from './WelcomeArt';

interface DeckProps { open: boolean; canSetUp: boolean; onDone: () => void }

/** Mounted only while open, so every opening starts at the first card. */
export function WelcomeDeck(props: DeckProps) {
  return props.open ? <Deck {...props} /> : null;
}

function Deck({ open, canSetUp, onDone }: DeckProps) {
  const [i, setI] = useState(0);
  const [dir, setDir] = useState<'next' | 'prev'>('next');
  const last = i === WELCOME_CARDS.length - 1;
  const card = WELCOME_CARDS[i];

  const go = (to: number) => {
    if (to < 0 || to >= WELCOME_CARDS.length || to === i) return;
    setDir(to > i ? 'next' : 'prev');
    setI(to);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') { if (last) onDone(); else go(i + 1); }
      if (e.key === 'ArrowLeft') go(i - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <Modal open={open} onClose={onDone} size="md" ariaLabel="Welcome to Lowpass">
      {/* Stage */}
      <div
        className="relative overflow-hidden"
        style={{
          height: 220,
          borderRadius: 'var(--lp-radius-lg)',
          border: '1px solid var(--lp-border)',
          background: 'radial-gradient(120% 100% at 0% 0%, #FF45001f, transparent 55%), radial-gradient(90% 90% at 100% 100%, #FF45000f, transparent 60%), var(--lp-bg)',
        }}
      >
        <div key={i} className={dir === 'next' ? 'lp-onb-next absolute inset-0' : 'lp-onb-prev absolute inset-0'}>
          <WelcomeArt art={card.art} />
        </div>
      </div>

      {/* Progress */}
      <div className="flex" role="tablist" aria-label="Welcome cards" style={{ gap: 'var(--lp-space-1)', marginTop: 'var(--lp-space-5)' }}>
        {WELCOME_CARDS.map((c, n) => (
          <button
            key={c.art}
            type="button"
            role="tab"
            aria-selected={n === i}
            aria-label={`${n + 1} of ${WELCOME_CARDS.length}: ${c.title}`}
            onClick={() => go(n)}
            className="flex-1 cursor-pointer"
            style={{ padding: 'var(--lp-space-1) 0', background: 'none', border: 0 }}
          >
            <span
              className="block"
              style={{
                height: 3, borderRadius: 'var(--lp-radius-full)',
                background: n <= i ? 'var(--lp-orange)' : 'var(--lp-border-strong)',
                opacity: n < i ? 0.45 : 1,
                transition: 'background var(--lp-duration-slow) var(--lp-ease-out), opacity var(--lp-duration-slow) var(--lp-ease-out)',
              }}
            />
          </button>
        ))}
      </div>

      {/* Words */}
      <div key={`t${i}`} className="lp-onb-rise" style={{ marginTop: 'var(--lp-space-4)', minHeight: 96 }}>
        {i === 0 ? (
          <div style={{ fontSize: 'var(--lp-text-xs)', fontWeight: 'var(--lp-weight-semibold)', color: 'var(--lp-orange)', marginBottom: 'var(--lp-space-1)' }}>
            Welcome to Lowpass
          </div>
        ) : null}
        <h2 style={{ margin: 0, fontSize: 'var(--lp-text-xl)', fontWeight: 'var(--lp-weight-semibold)', color: 'var(--lp-text)', letterSpacing: '-0.01em' }}>
          {card.title}
        </h2>
        <p style={{ margin: 'var(--lp-space-2) 0 0', fontSize: 'var(--lp-text-sm)', lineHeight: 'var(--lp-leading-relaxed)', color: 'var(--lp-text-secondary)' }}>
          {card.body}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center" style={{ gap: 'var(--lp-space-2)', marginTop: 'var(--lp-space-5)' }}>
        <Button variant="ghost" size="md" onClick={onDone}>Skip</Button>
        <span className="flex-1" />
        {i > 0 ? <Button variant="secondary" size="md" onClick={() => go(i - 1)}>Back</Button> : null}
        <Button
          variant="primary"
          size="md"
          onClick={() => (last ? onDone() : go(i + 1))}
          trailingIcon={<ArrowRight size={14} aria-hidden />}
        >
          {last ? (canSetUp ? 'Get set up' : 'Let’s go') : 'Next'}
        </Button>
      </div>
    </Modal>
  );
}

'use client';

/* ============================================
   LOWPASS — Welcome card illustrations (Nov 2026)

   Small, live-drawn sketches of the real surfaces — no screenshots to go
   stale. Labels are the app's own (rail names from src/lib/nav/ia.ts, the
   tour templates from src/lib/templates/tourTemplates.ts). Motion comes from
   the lp-onb-* classes in globals.css; under reduced motion each sketch shows
   its finished state. Decorative: aria-hidden, the card's text carries the
   meaning.
   ============================================ */

import { Check, Command, FileText, LayoutDashboard, ReceiptText, Send, Shapes, Table2, TrendingUp, Wallet, type LucideIcon } from 'lucide-react';
import type { WelcomeArt as Art } from '@/lib/onboarding/checklist';

const delay = (ms: number): React.CSSProperties => ({ animationDelay: `${ms}ms` });
const tiny: React.CSSProperties = { fontSize: 'var(--lp-text-2xs)', lineHeight: 1.2 };
const line = (w: string, o = 1): React.CSSProperties => ({
  height: 6, width: w, borderRadius: 'var(--lp-radius-full)', background: 'var(--lp-border-strong)', opacity: o,
});

export function WelcomeArt({ art }: { art: Art }) {
  return (
    <div aria-hidden className="relative h-full w-full overflow-hidden">
      {art === 'rail' ? <RailArt /> : art === 'templates' ? <TemplatesArt /> : art === 'advance' ? <AdvanceArt /> : <MoneyArt />}
    </div>
  );
}

/* 1 — the rail: one tour, grouped around Advance, Budget and Production; the
   highlight walks the Budget group. Labels and icons as in TOUR_RAIL
   (src/lib/nav/ia.ts). The highlight's keyframes (lp-onb-rail) step over
   exactly RAIL_BUDGET.length rows. */
const RAIL_BUDGET: Array<[string, LucideIcon]> = [['Budget', Table2], ['Income & settlements', TrendingUp], ['Payroll', Wallet], ['Receipts', ReceiptText]];
const RAIL_PRODUCTION: Array<[string, LucideIcon]> = [['Riders', FileText], ['Stage plot', Shapes]];
const ROW = 24;

function RailArt() {
  const heading = (label: string) => (
    <div style={{ ...tiny, color: 'var(--lp-text-tertiary)', padding: 'var(--lp-space-2) var(--lp-space-2) var(--lp-space-1)' }}>{label}</div>
  );
  const quiet = ([l, Icon]: [string, LucideIcon]) => (
    <div key={l} className="flex items-center" style={{ ...tiny, height: ROW, gap: 'var(--lp-space-2)', padding: '0 var(--lp-space-2)', color: 'var(--lp-text-tertiary)' }}>
      <Icon size={12} strokeWidth={2} />
      {l}
    </div>
  );
  return (
    <div className="lp-onb-rise absolute flex overflow-hidden" style={{ ...frame, inset: 'var(--lp-space-5) var(--lp-space-6) 0' }}>
      <div style={{ width: 160, padding: 'var(--lp-space-1) var(--lp-space-2) var(--lp-space-3)', borderRight: '1px solid var(--lp-border)', background: 'var(--lp-bg)' }}>
        {heading('Tour')}
        {quiet(['Overview', LayoutDashboard])}
        {quiet(['Advance', Send])}
        {heading('Budget')}
        <div className="relative">
          <div
            className="lp-onb-rail absolute"
            style={{ left: 0, right: 0, top: 0, height: ROW, borderRadius: 'var(--lp-radius-sm)', background: '#FF450014', borderLeft: '2px solid var(--lp-orange)' }}
          />
          {RAIL_BUDGET.map(([l, Icon]) => (
            <div key={l} className="relative flex items-center" style={{ ...tiny, height: ROW, gap: 'var(--lp-space-2)', padding: '0 var(--lp-space-2)', color: 'var(--lp-text-secondary)', whiteSpace: 'nowrap' }}>
              <Icon size={12} strokeWidth={2} />
              {l}
            </div>
          ))}
        </div>
        {heading('Production')}
        {RAIL_PRODUCTION.map(quiet)}
      </div>
      <div className="flex flex-1 flex-col" style={{ padding: 'var(--lp-space-4)', gap: 'var(--lp-space-3)' }}>
        <div style={line('40%')} />
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="lp-onb-rise flex items-center" style={{ ...delay(150 + i * 90), gap: 'var(--lp-space-3)' }}>
            <span style={{ ...tiny, width: 44, flexShrink: 0, whiteSpace: 'nowrap', color: 'var(--lp-text-tertiary)', fontFamily: 'var(--lp-font-numeric)' }}>{`${14 + i} Aug`}</span>
            <div style={line(`${[62, 48, 70, 40, 55][i]}%`, 0.7)} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* 2 — templates: pick a size; the lines and questions come with it. */
const TEMPLATE_LABELS = ['Support tour', 'Club', 'Theatre', 'Arena', 'Stadium', 'Press tour'];

function TemplatesArt() {
  return (
    <div className="absolute flex flex-col justify-center" style={{ inset: 'var(--lp-space-5) var(--lp-space-6)', gap: 'var(--lp-space-4)' }}>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--lp-space-2)' }}>
        {TEMPLATE_LABELS.map((l, i) => {
          const picked = l === 'Arena';
          return (
            <div key={l} className="lp-onb-pop" style={{ ...delay(i * 70), position: 'relative' }}>
              <div
                className={picked ? 'lp-onb-select' : undefined}
                style={{
                  ...tiny, padding: 'var(--lp-space-2) var(--lp-space-3)', borderRadius: 'var(--lp-radius-md)',
                  border: `1px solid ${picked ? 'var(--lp-text)' : 'var(--lp-border)'}`,
                  background: picked ? 'var(--lp-surface-hover)' : 'var(--lp-panel)',
                  color: 'var(--lp-text)', fontWeight: 'var(--lp-weight-semibold)',
                }}
              >
                {l}
                <div style={{ ...line(`${[55, 40, 62, 48, 70, 45][i]}%`, 0.5), height: 4, marginTop: 'var(--lp-space-2)' }} />
                {picked ? <Check size={11} className="lp-onb-pop absolute" style={{ ...delay(950), top: 'var(--lp-space-2)', right: 'var(--lp-space-2)' }} /> : null}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap" style={{ gap: 'var(--lp-space-2)' }}>
        {['Transport · 7 lines', 'Production · 15 lines', 'Advance · Headline show day'].map((c, i) => (
          <span key={c} className="lp-onb-rise" style={{ ...chip, ...delay(1200 + i * 140) }}>{c}</span>
        ))}
      </div>
    </div>
  );
}

/* 3 — the advance board: every show × question group; answers fill in. */
const SHOWS = ['Leeds', 'Glasgow', 'Dublin', 'London'];
const FILLED = [
  [1, 1, 1, 1, 1],
  [1, 1, 1, 0, 1],
  [1, 0, 1, 0, 0],
  [1, 0, 0, 0, 0],
];

function AdvanceArt() {
  return (
    <div className="lp-onb-rise absolute" style={{ ...frame, inset: 'var(--lp-space-5) var(--lp-space-6) 0', padding: 'var(--lp-space-3) var(--lp-space-4)' }}>
      <div className="grid items-center" style={{ gridTemplateColumns: '64px repeat(5, 1fr) auto', columnGap: 'var(--lp-space-2)', rowGap: 'var(--lp-space-2)' }}>
        <span />
        {['Contacts', 'Schedule', 'Production', 'Hospo', 'Settle'].map((h) => (
          <span key={h} style={{ ...tiny, color: 'var(--lp-text-tertiary)', textAlign: 'center' }}>{h}</span>
        ))}
        <span />
        {SHOWS.map((s, r) => (
          <Row key={s} show={s} cells={FILLED[r]} r={r} />
        ))}
      </div>
    </div>
  );
}

function Row({ show, cells, r }: { show: string; cells: number[]; r: number }) {
  return (
    <>
      <span style={{ ...tiny, color: 'var(--lp-text)', fontWeight: 'var(--lp-weight-medium)' }}>{show}</span>
      {cells.map((on, c) => (
        <span
          key={c}
          className={on ? 'lp-onb-fill' : undefined}
          style={{
            ...(on ? delay(300 + (r * 5 + c) * 45) : {}),
            height: 14, borderRadius: 'var(--lp-radius-xs)',
            border: `1px solid ${on ? 'transparent' : 'var(--lp-border)'}`,
            background: on ? 'color-mix(in srgb, var(--color-lp-success) 55%, transparent)' : 'transparent',
          }}
        />
      ))}
      {r === 3 ? (
        <span className="lp-onb-pop inline-flex items-center" style={{ ...chip, ...delay(1500), gap: 'var(--lp-space-1)', borderColor: 'var(--lp-orange)', color: 'var(--lp-text)' }}>
          <Send size={10} /> Link sent
        </span>
      ) : <span />}
    </>
  );
}

/* 4 — money: automatic lines land, a receipt reads itself, it totals. */
const MONEY: Array<{ label: string; from: string; amount: string; w: number }> = [
  { label: 'Hotels', from: 'Hotels & rooming', amount: '£4,820', w: 38 },
  { label: 'Flights', from: 'Travel', amount: '£6,140', w: 49 },
  { label: 'Salaries', from: 'Payroll', amount: '£12,600', w: 100 },
  { label: 'Per diems', from: 'Payroll', amount: '£1,350', w: 11 },
  { label: 'Fuel', from: 'Receipt', amount: '£182', w: 3 },
];

function MoneyArt() {
  return (
    <div className="lp-onb-rise absolute" style={{ ...frame, inset: 'var(--lp-space-5) var(--lp-space-6) 0', padding: 'var(--lp-space-3) var(--lp-space-4)' }}>
      {MONEY.map((m, i) => (
        <div
          key={m.label}
          className="lp-onb-rise grid items-center"
          style={{ ...delay(150 + i * 120), gridTemplateColumns: '64px 128px 1fr 56px', gap: 'var(--lp-space-2)', height: 22 }}
        >
          <span style={{ ...tiny, color: 'var(--lp-text)' }}>{m.label}</span>
          <span style={{ ...tiny, color: 'var(--lp-text-tertiary)', whiteSpace: 'nowrap' }}>from {m.from}</span>
          <span style={{ height: 6, background: 'var(--lp-surface-hover)', borderRadius: 'var(--lp-radius-full)', overflow: 'hidden' }}>
            <span className="lp-onb-grow block" style={{ ...delay(300 + i * 120), height: '100%', width: `${m.w}%`, background: 'var(--lp-orange)', borderRadius: 'var(--lp-radius-full)' }} />
          </span>
          <span style={{ ...tiny, textAlign: 'right', color: 'var(--lp-text)', fontFamily: 'var(--lp-font-numeric)' }}>{m.amount}</span>
        </div>
      ))}
      <div className="lp-onb-rise flex items-center justify-between" style={{ ...delay(900), marginTop: 'var(--lp-space-2)', paddingTop: 'var(--lp-space-2)', borderTop: '1px solid var(--lp-border)' }}>
        <span style={{ ...tiny, color: 'var(--lp-text)', fontWeight: 'var(--lp-weight-semibold)' }}>Total expenses</span>
        <span style={{ ...tiny, color: 'var(--lp-text)', fontWeight: 'var(--lp-weight-semibold)', fontFamily: 'var(--lp-font-numeric)' }}>£25,092</span>
      </div>
      <span
        className="lp-onb-bob absolute inline-flex items-center"
        style={{ ...chip, right: 'var(--lp-space-4)', bottom: 'var(--lp-space-4)', gap: 'var(--lp-space-1)', boxShadow: 'var(--lp-shadow-md)', background: 'var(--lp-surface)' }}
      >
        <Command size={10} />K · jump anywhere
      </span>
    </div>
  );
}

const frame: React.CSSProperties = {
  borderRadius: 'var(--lp-radius-lg) var(--lp-radius-lg) 0 0',
  border: '1px solid var(--lp-border)',
  borderBottom: 0,
  background: 'var(--lp-surface)',
  boxShadow: 'var(--lp-shadow-lg)',
};

const chip: React.CSSProperties = {
  ...tiny,
  padding: 'var(--lp-space-1) var(--lp-space-2)',
  borderRadius: 'var(--lp-radius-full)',
  border: '1px solid var(--lp-border-strong)',
  background: 'var(--lp-panel)',
  color: 'var(--lp-text-secondary)',
  whiteSpace: 'nowrap',
};

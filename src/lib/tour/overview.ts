/* ============================================
   LOWPASS — tour Overview: the rules (Nov 2026, Adam)

   Where a tour opens. NOT a dashboard of cards — Lowpass built two of those
   and deleted both. It answers one question: what needs me on this tour?
   Every line is a count and a link to the exact page that fixes it; when
   nothing needs you it says so, and the next show and the three areas
   (Advance, Budget, Production) are still there.

   Pure: facts in (src/server/tour/overview.ts reads them, writes nothing),
   what to show out.
   ============================================ */

import type { RequestKind } from '@/lib/advance/board';

export const SOON_DAYS = 14;

export interface OverviewShow {
  routingId: string;
  date: string;
  dayType: string;
  venue: string | null;
  city: string | null;
  answered: number;
  total: number;
  toReview: number;
  /** The venue request, as the board reads it. */
  requestKind: RequestKind;
  /** Its label from the board: "Not sent", "Sent 2 days ago", … */
  requestLabel: string;
}

/** What this viewer may see (the rail's own access list, P-1). A part they
 *  can't open is neither read nor shown. */
export interface OverviewAllow {
  advance: boolean;
  budget: boolean;
  receipts: boolean;
  crew: boolean;
  production: boolean;
}
export const ALLOW_ALL: OverviewAllow = { advance: true, budget: true, receipts: true, crew: true, production: true };

export interface OverviewFacts {
  tourId: string;
  today: string;
  allow: OverviewAllow;
  /** Every day with an advance (the board's rows). */
  shows: OverviewShow[];
  /** Show days whose settlement is reconciled. */
  settledRoutingIds: ReadonlySet<string>;
  receiptsNeedingDetails: number;
  unconfirmedCrew: number;
  linesOverEstimate: number;
  money: { currency: string; plannedCosts: number; spentCosts: number; plannedNet: number } | null;
  production: Array<{ kind: 'rider' | 'channel_list' | 'stage_plot'; count: number; updatedAt: string | null }>;
}

export interface NeedsYouLine {
  id: 'advance-soon' | 'advance-review' | 'receipts' | 'settle' | 'crew' | 'over-estimate';
  count: number;
  text: string;
  href: string;
  cta: string;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso.slice(0, 10)}T12:00:00Z`);
  const b = Date.parse(`${toIso.slice(0, 10)}T12:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export const isShowDay = (dayType: string) => ['show', 'festival'].includes((dayType.split(',')[0] ?? '').trim().toLowerCase());
const advanced = (s: OverviewShow) => s.total > 0 && s.answered >= s.total && s.toReview === 0;

/** The next show or festival day, today included. */
export function nextShow(f: Pick<OverviewFacts, 'shows' | 'today'>): (OverviewShow & { inDays: number }) | null {
  const s = f.shows.filter((x) => isShowDay(x.dayType) && x.date >= f.today).sort((a, b) => a.date.localeCompare(b.date))[0];
  return s ? { ...s, inDays: daysBetween(f.today, s.date) } : null;
}

export function whenText(inDays: number): string {
  if (inDays <= 0) return 'today';
  if (inDays === 1) return 'tomorrow';
  return `in ${inDays} days`;
}

/** What needs you, most urgent first. Empty = nothing does. */
export function needsYou(f: OverviewFacts): NeedsYouLine[] {
  const t = f.tourId;
  const out: NeedsYouLine[] = [];
  const a = f.allow;
  const upcoming = a.advance ? f.shows.filter((s) => s.date >= f.today) : [];
  const soon = upcoming.filter((s) => daysBetween(f.today, s.date) <= SOON_DAYS && !advanced(s));
  if (soon.length) {
    out.push({
      id: 'advance-soon',
      count: soon.length,
      text: `${plural(soon.length, 'day')} in the next two weeks ${soon.length === 1 ? 'isn’t' : 'aren’t'} fully advanced`,
      href: `/advance/${t}`,
      cta: 'Advance',
    });
  }
  const review = upcoming.reduce((n, s) => n + s.toReview, 0);
  if (review) {
    out.push({ id: 'advance-review', count: review, text: `${plural(review, 'advance answer')} to review`, href: `/advance/${t}`, cta: 'Review' });
  }
  const unsettled = !a.budget ? 0 : f.shows.filter((s) => isShowDay(s.dayType) && s.date < f.today && !f.settledRoutingIds.has(s.routingId)).length;
  if (unsettled) {
    out.push({ id: 'settle', count: unsettled, text: `${plural(unsettled, 'show')} played but not settled`, href: `/budget/${t}/settlement`, cta: 'Settle' });
  }
  if (a.receipts && f.receiptsNeedingDetails) {
    out.push({
      id: 'receipts',
      count: f.receiptsNeedingDetails,
      text: `${plural(f.receiptsNeedingDetails, 'receipt')} ${f.receiptsNeedingDetails === 1 ? 'needs' : 'need'} details`,
      href: `/budget/${t}?tab=receipts`,
      cta: 'Receipts',
    });
  }
  if (a.crew && f.unconfirmedCrew) {
    out.push({
      id: 'crew',
      count: f.unconfirmedCrew,
      text: `${plural(f.unconfirmedCrew, 'crew member')} not confirmed`,
      href: `/operations/${t}/personnel`,
      cta: 'Crew',
    });
  }
  if (a.budget && f.linesOverEstimate) {
    out.push({
      id: 'over-estimate',
      count: f.linesOverEstimate,
      text: `${plural(f.linesOverEstimate, 'budget line')} over estimate`,
      href: `/budget/${t}?tab=budget`,
      cta: 'Budget',
    });
  }
  return out;
}

/** "7 of 10 days advanced · 2 waiting on venues" */
export function advanceLine(f: Pick<OverviewFacts, 'shows'>): string {
  if (!f.shows.length) return 'No days to advance yet';
  const done = f.shows.filter(advanced).length;
  const waiting = f.shows.filter((s) => !advanced(s) && (s.requestKind === 'sent' || s.requestKind === 'opened')).length;
  return `${done} of ${plural(f.shows.length, 'day')} advanced${waiting ? ` · ${waiting} waiting on ${waiting === 1 ? 'a venue' : 'venues'}` : ''}`;
}

export function money(n: number, currency: string): string {
  const sym: Record<string, string> = { GBP: '£', USD: '$', EUR: '€', AUD: 'A$', CAD: 'C$' };
  const s = Math.round(Math.abs(n)).toLocaleString('en-GB');
  return `${n < 0 ? '−' : ''}${sym[currency] ?? `${currency} `}${s}`;
}

/** "£12,400 spent of £48,000 planned · £6,200 net planned" */
export function budgetLine(f: Pick<OverviewFacts, 'money'>): string {
  const m = f.money;
  if (!m) return 'Budget not set up yet';
  if (!m.plannedCosts && !m.spentCosts) return 'No costs entered yet';
  return `${money(m.spentCosts, m.currency)} spent of ${money(m.plannedCosts, m.currency)} planned · ${money(m.plannedNet, m.currency)} net planned`;
}

const PROD_LABEL: Record<OverviewFacts['production'][number]['kind'], string> = {
  rider: 'Rider',
  channel_list: 'Channel list',
  stage_plot: 'Stage plot',
};

export function agoText(iso: string | null, today: string): string {
  if (!iso) return '';
  const d = daysBetween(iso, today);
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 30) return `${d} days ago`;
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** "Rider updated 3 days ago · Channel list not made · Stage plot updated 2 Nov" */
export function productionLine(f: Pick<OverviewFacts, 'production' | 'today'>): string {
  return (['rider', 'channel_list', 'stage_plot'] as const)
    .map((k) => {
      const p = f.production.find((x) => x.kind === k);
      return p && p.count ? `${PROD_LABEL[k]} updated ${agoText(p.updatedAt, f.today)}` : `${PROD_LABEL[k]} not made`;
    })
    .join(' · ');
}

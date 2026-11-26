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
  production: boolean;
}
export const ALLOW_ALL: OverviewAllow = { advance: true, budget: true, receipts: true, production: true };

export interface OverviewFacts {
  tourId: string;
  today: string;
  allow: OverviewAllow;
  /** Every day with an advance (the board's rows). */
  shows: OverviewShow[];
  /** Show days whose settlement is reconciled. */
  settledRoutingIds: ReadonlySet<string>;
  receiptsNeedingDetails: number;
  linesOverEstimate: number;
  money: { currency: string; plannedCosts: number; spentCosts: number; plannedNet: number } | null;
  /** Channel lists / stage plots (rider_packs). Riders are `riders` below. */
  production: Array<{ kind: 'rider' | 'channel_list' | 'stage_plot'; count: number; updatedAt: string | null }>;
  /** The tour's rider (migration 301) — null when production isn't the
   *  viewer's to see or the riders tables aren't there yet. */
  riders?: {
    /** Tech / Hospitality documents started. */
    docs: number;
    latest: { label: string; publishedAt: string } | null;
    /** Upcoming shows not yet sent the latest version (lib/riders/status). */
    toSend: number;
    /** Lines a promoter replied on, waiting for an answer. */
    toAnswer: number;
  } | null;
}

export interface NeedsYouLine {
  id: 'advance-soon' | 'advance-review' | 'receipts' | 'settle' | 'over-estimate' | 'rider-replies' | 'rider-send';
  count: number;
  /** The sentence, count included: "7 days in the next two weeks aren't fully advanced". */
  text: string;
  /** The same without the count, for a layout that shows the number on its own. */
  what: string;
  href: string;
  cta: string;
}

const word = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${word(n, one, many)}`;
/** A needs-you line: the sentence and the same words without the count. */
const line = (count: number, what: string) => ({ count, what, text: `${count} ${what}` });

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
      ...line(soon.length, `${word(soon.length, 'day')} in the next two weeks ${soon.length === 1 ? 'isn’t' : 'aren’t'} fully advanced`),
      href: `/advance/${t}`,
      cta: 'Advance',
    });
  }
  const review = upcoming.reduce((n, s) => n + s.toReview, 0);
  if (review) {
    out.push({ id: 'advance-review', ...line(review, `${word(review, 'advance answer')} to review`), href: `/advance/${t}`, cta: 'Review' });
  }
  const r = a.production ? f.riders : null;
  if (r?.toAnswer) {
    out.push({
      id: 'rider-replies',
      ...line(r.toAnswer, `rider ${word(r.toAnswer, 'reply', 'replies')} to answer`),
      href: `/operations/${t}/riders?panel=replies`,
      cta: 'Reply',
    });
  }
  if (r?.latest && r.toSend) {
    out.push({
      id: 'rider-send',
      ...line(r.toSend, `${word(r.toSend, 'show')} ${r.toSend === 1 ? 'hasn’t' : 'haven’t'} been sent rider version ${r.latest.label}`),
      href: `/operations/${t}/riders?panel=shows`,
      cta: 'Send',
    });
  }
  const unsettled = !a.budget ? 0 : f.shows.filter((s) => isShowDay(s.dayType) && s.date < f.today && !f.settledRoutingIds.has(s.routingId)).length;
  if (unsettled) {
    out.push({ id: 'settle', ...line(unsettled, `${word(unsettled, 'show')} played but not settled`), href: `/budget/${t}?tab=income`, cta: 'Settle' });
  }
  if (a.receipts && f.receiptsNeedingDetails) {
    out.push({
      id: 'receipts',
      ...line(f.receiptsNeedingDetails, `${word(f.receiptsNeedingDetails, 'receipt')} ${f.receiptsNeedingDetails === 1 ? 'needs' : 'need'} details`),
      href: `/budget/${t}?tab=receipts`,
      cta: 'Receipts',
    });
  }
  if (a.budget && f.linesOverEstimate) {
    out.push({
      id: 'over-estimate',
      ...line(f.linesOverEstimate, `${word(f.linesOverEstimate, 'budget line')} over estimate`),
      href: `/budget/${t}?tab=budget`,
      cta: 'Budget',
    });
  }
  return out;
}

/** "3 of 12 days ahead fully advanced · 2 waiting on venues" — days already
 *  played don't count: there is nothing left to advance on them. */
export function advanceLine(f: Pick<OverviewFacts, 'shows' | 'today'>): string {
  if (!f.shows.length) return 'No days to advance yet';
  const ahead = f.shows.filter((s) => s.date >= f.today);
  if (!ahead.length) return 'No days left to advance';
  const done = ahead.filter(advanced).length;
  const waiting = ahead.filter((s) => !advanced(s) && (s.requestKind === 'sent' || s.requestKind === 'opened')).length;
  return `${done} of ${plural(ahead.length, 'day')} ahead fully advanced${waiting ? ` · ${waiting} waiting on ${waiting === 1 ? 'a venue' : 'venues'}` : ''}`;
}

export function money(n: number, currency: string): string {
  const sym: Record<string, string> = { GBP: '£', USD: '$', EUR: '€', AUD: 'A$', CAD: 'C$' };
  const s = Math.round(Math.abs(n)).toLocaleString('en-GB');
  return `${n < 0 ? '−' : ''}${sym[currency] ?? `${currency} `}${s}`;
}

/** "£2,449 over · £46,011 spent of £43,562" / "£35,600 left · £12,400 spent
 *  of £48,000 · −£1,500 net". Net only when income is planned — with none,
 *  "net" is just the costs with a minus sign, which read as a contradiction. */
export function budgetLine(f: Pick<OverviewFacts, 'money'>): string {
  const m = f.money;
  if (!m) return 'Budget not set up yet';
  if (!m.plannedCosts && !m.spentCosts) return 'No costs entered yet';
  const gap = m.plannedCosts - m.spentCosts;
  const head = gap < 0 ? `${money(-gap, m.currency)} over` : `${money(gap, m.currency)} left`;
  const income = m.plannedNet + m.plannedCosts;
  const net = income > 0 ? ` · ${money(m.plannedNet, m.currency)} net` : '';
  return `${head} · ${money(m.spentCosts, m.currency)} spent of ${money(m.plannedCosts, m.currency)}${net}`;
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

/** "Rider version 1.7, published 3 days ago · Channel list not made · Stage plot
 *  updated 2 Nov". The rider is the tour's Tech / Hospitality documents
 *  (migration 301): a version once published, else a draft, else not made. */
export function productionLine(f: Pick<OverviewFacts, 'production' | 'today' | 'riders'>): string {
  const rider = f.riders?.latest
    ? `Rider version ${f.riders.latest.label}, published ${agoText(f.riders.latest.publishedAt, f.today)}`
    : f.riders?.docs
      ? 'Rider not published yet'
      : 'Rider not made';
  const rest = (['channel_list', 'stage_plot'] as const).map((k) => {
    const p = f.production.find((x) => x.kind === k);
    return p && p.count ? `${PROD_LABEL[k]} updated ${agoText(p.updatedAt, f.today)}` : `${PROD_LABEL[k]} not made`;
  });
  return [rider, ...rest].join(' · ');
}

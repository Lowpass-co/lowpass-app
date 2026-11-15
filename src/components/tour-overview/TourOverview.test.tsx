/* The tour Overview, as redrawn Nov 2026: "Today" when the show is today, a
   count + words + link per thing that needs you, one orange button. */

import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { TourOverview } from './TourOverview';
import { ALLOW_ALL, type OverviewFacts, type OverviewShow } from '@/lib/tour/overview';

const show = (date: string, o: Partial<OverviewShow> = {}): OverviewShow => ({
  routingId: `r-${date}`, date, dayType: 'show', venue: 'Venue', city: 'City', answered: 10, total: 100, toReview: 0,
  requestKind: 'answered', requestLabel: 'Answered', ...o,
});
const facts = (extra: Partial<OverviewFacts> = {}): OverviewFacts => ({
  tourId: 't1', today: '2026-11-15', allow: ALLOW_ALL,
  shows: [show('2026-11-10'), show('2026-11-15', { venue: 'Co-op Live', city: 'Manchester', answered: 31, total: 114, toReview: 1 }), show('2026-11-17')],
  settledRoutingIds: new Set(), receiptsNeedingDetails: 0, unconfirmedCrew: 0, linesOverEstimate: 1,
  money: { currency: 'GBP', plannedCosts: 43562, spentCosts: 46011, plannedNet: -43562 },
  production: [],
  ...extra,
});

describe('<TourOverview>', () => {
  it('a show today is the headline: "Today", the venue, its advance, one orange button to it', () => {
    const { container } = render(<TourOverview facts={facts()} />);
    const next = screen.getByTestId('overview-next');
    expect(within(next).getByRole('heading', { name: 'Today' })).toBeTruthy();
    expect(within(next).getByText('Co-op Live')).toBeTruthy();
    expect(within(next).getByText('Advance 31 of 114 answered')).toBeTruthy();
    expect(within(next).getByText('1 to review')).toBeTruthy();
    expect(within(next).getByRole('link', { name: /Open advance/ }).getAttribute('href')).toBe('/advance/t1/r-2026-11-15');
    expect(container.querySelectorAll('.ov-cta')).toHaveLength(1);
  });

  it('another day says how far off it is', () => {
    render(<TourOverview facts={facts({ shows: [show('2026-11-18', { venue: 'O2' })] })} />);
    expect(screen.getByRole('heading', { name: 'Next show · in 3 days' })).toBeTruthy();
  });

  it('needs you: the count on its own, the words beside it, the whole row a link', () => {
    render(<TourOverview facts={facts()} />);
    const needs = screen.getByTestId('overview-needs');
    const settle = within(needs).getByRole('link', { name: /1 show played but not settled/ });
    expect(settle.getAttribute('href')).toBe('/budget/t1?tab=income');
    expect(within(settle).getByText('1').className).toBe('ov-count');
    expect(within(settle).getByText('show played but not settled')).toBeTruthy();
  });

  it('this tour: the budget says how far over, without a "net" made of costs', () => {
    render(<TourOverview facts={facts()} />);
    expect(screen.getByText('£2,449 over · £46,011 spent of £43,562')).toBeTruthy();
    expect(screen.queryByText(/net planned/)).toBeNull();
  });

  it('nothing to do says so', () => {
    render(<TourOverview facts={facts({ shows: [show('2026-11-17', { answered: 100 })], linesOverEstimate: 0 })} />);
    expect(screen.getByText(/Nothing needs you right now/)).toBeTruthy();
  });
});

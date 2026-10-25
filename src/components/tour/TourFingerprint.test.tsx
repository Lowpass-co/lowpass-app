/* ============================================
   <TourFingerprint> — Oct 2026 rebuild (Adam: "fix the little tour graphics so
   they don't glitch and are clearer … never spill onto two lines").

   Pins: every day is one cell of the SAME height on ONE line (no second
   stacked tick, no wrapping); today is marked inside the strip; past days are
   dimmed; start/end dates sit under it; nothing animates or lifts.
   ============================================ */

import { describe, expect, it } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { DayTypeLegend, TourFingerprint, dayCellColour, type FingerprintDay } from './TourFingerprint';
import { dayTypesPresent } from '@/lib/routing/dayTypesPresent';

const days: FingerprintDay[] = [
  { date: '2026-10-01', dayType: 'rehearsal' },
  { date: '2026-10-02', dayType: 'show' },
  { date: '2026-10-03', dayType: 'off' },
  { date: '2026-10-04', dayType: 'show,press' },
  { date: '2026-10-05', dayType: 'travel' },
  { date: '2026-10-06', dayType: 'show' },
];

const cells = () => within(screen.getByRole('list')).getAllByRole('listitem') as HTMLElement[];

describe('<TourFingerprint>', () => {
  it('one cell per day, all the same height, on one non-wrapping line', () => {
    render(<TourFingerprint days={days} size="row" fill today="2026-10-04" />);
    const list = screen.getByRole('list');
    expect(list.style.flexWrap).toBe('nowrap');
    expect(cells()).toHaveLength(days.length);
    expect(new Set(cells().map((c) => c.style.height))).toEqual(new Set(['12px']));
    // a two-type day is still ONE cell (no stacked second tick)
    expect(cells()[3].children).toHaveLength(1); // only the today marker
  });

  it('marks today inside the strip and names it in the label', () => {
    render(<TourFingerprint days={days} size="card" fill today="2026-10-04" />);
    const marker = screen.getByTestId('fingerprint-today');
    expect(cells()[3].contains(marker)).toBe(true);
    expect(cells()[3].getAttribute('aria-current')).toBe('date');
    expect(cells()[3].getAttribute('aria-label')).toMatch(/Show Day \+ Press Day · today/);
  });

  it('no today marker when the tour is not running', () => {
    render(<TourFingerprint days={days} size="card" fill today="2026-12-01" />);
    expect(screen.queryByTestId('fingerprint-today')).toBeNull();
  });

  it('dims days before today', () => {
    render(<TourFingerprint days={days} size="row" fill today="2026-10-04" />);
    // jsdom drops color-mix() backgrounds, so compare the rule's output directly
    expect(dayCellColour('show', true)).toContain('30%');
    expect(dayCellColour('show', false)).toContain('82%');
    expect(cells()).toHaveLength(6);
  });

  it('start and end dates sit under the strip; hero leaves them to the week labels', () => {
    const { unmount } = render(<TourFingerprint days={days} size="row" fill today="2026-10-04" />);
    expect(screen.getByText('1 Oct')).toBeTruthy();
    expect(screen.getByText('6 Oct')).toBeTruthy();
    unmount();
    render(<TourFingerprint days={days} size="hero" fill weekMarkers={false} today="2026-10-04" />);
    expect(screen.queryByText('1 Oct')).toBeNull();
  });

  it('hover never moves a day (no lift) and opens a one-line popover', () => {
    render(<TourFingerprint days={days} size="row" fill today="2026-10-04" />);
    fireEvent.mouseEnter(cells()[1]);
    expect(cells()[1].style.transform).toBe('');
    expect(screen.getByRole('tooltip').textContent).toMatch(/Fri 2 Oct · Show Day/);
  });

  it('a highlighted day that is not today gets the quieter marker', () => {
    render(<TourFingerprint days={days} size="hero" fill today="2026-09-01" highlightDate="2026-10-02" />);
    expect(cells()[1].contains(screen.getByTestId('fingerprint-highlight'))).toBe(true);
  });
});

describe('<DayTypeLegend>', () => {
  it('lists only the types present, in a fixed order, plus Today and Past — on one line', () => {
    const types = dayTypesPresent([days]);
    expect(types).toEqual(['show', 'travel', 'off', 'rehearsal']);
    render(<DayTypeLegend dayTypes={types} />);
    const legend = screen.getByTestId('day-type-legend');
    expect(legend.style.flexWrap).toBe('nowrap');
    expect(legend.textContent).toBe('ShowTravelOffRehearsalTodayPast');
  });
});

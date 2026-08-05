/* ============================================
   LOWPASS — KEY-04..07 keyboard contract, automated (F-1)

   THE POINT OF THIS FILE: the routing keyboard contract has regressed THREE
   times — Tab-swallowing (CC_ROUTING_KEYBOARD), then arrows-opening-a-popup
   (VIS-TR-06), now arrows-doing-nothing (the R2 ledger rewrite). Every previous
   fix was verified by a manual walk, so every regression shipped. This makes the
   contract executable.

   Mounted at the LEDGER ROW level, not the bare dropdown, because the regression
   lived in the integration (the ledger swapped the control's variant and the
   committed value stopped propagating) — a unit test on DayTypeDropdown alone
   would have stayed green through it.

   Contract under test (docs/smoke-tests/routing-rail.md):
     KEY-04  focused day-type cell + ArrowDown → type cycles IN PLACE, committed,
             no popup.
     KEY-05  Tab from the day-type cell → focus lands on the venue input.
   ============================================ */

import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { RoutingLedger } from './RoutingLedger';
import type { RoutingRow } from './RoutingGrid';

// The ledger's children fetch (venue library search, drive times). None of them
// are under test here; keep them quiet and deterministic.
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ venues: [] }) })),
  );
});

// jsdom does no layout: offsetParent is null and every rect is 0x0, which made
// focusAdjacentCell filter out EVERY candidate — the advance was untestable.
// Give jsdom a plausible offsetParent so focus movement is observable.
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
    configurable: true,
    get() {
      return (this as HTMLElement).parentElement;
    },
  });
});


const ROWS: RoutingRow[] = [
  {
    date: '2026-10-01',
    day_type: 'rehearsal',
    city: 'Manchester',
    venue_name: 'O2 Apollo Manchester',
    transport_to_next: 'default',
  },
  {
    date: '2026-10-02',
    day_type: 'show',
    city: 'Manchester',
    venue_name: 'O2 Apollo Manchester',
    transport_to_next: 'default',
  },
];

/** Controlled host — mirrors RoutingEditor's updateRow so a commit is observable. */
function Host({ onCommit }: { onCommit?: (v: string) => void }) {
  const [rows, setRows] = useState<RoutingRow[]>(ROWS);
  return (
    <RoutingLedger
      rows={rows}
      primaryTransit="bus_van"
      tourId="tour-1"
      updateRow={(i, updates) => {
        if (updates.day_type !== undefined) onCommit?.(updates.day_type);
        setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...updates } : r)));
      }}
    />
  );
}

/** The day-type cell for a given row — the always-mounted trigger button. */
function dayTypeCell(rowIndex: number): HTMLElement {
  const rowEls = document.querySelectorAll('[data-routing-date]');
  const el = rowEls[rowIndex];
  if (!el) throw new Error(`no ledger row at index ${rowIndex}`);
  const btn = el.querySelector('button');
  if (!btn) throw new Error('day-type trigger button not found in row');
  return btn as HTMLElement;
}

function venueInput(rowIndex: number): HTMLElement {
  const rowEls = document.querySelectorAll('[data-routing-date]');
  const el = rowEls[rowIndex];
  const input = el?.querySelector('input[placeholder]');
  if (!input) throw new Error('venue input not found in row');
  return input as HTMLElement;
}

describe('routing ledger — keyboard contract', () => {
  it('KEY-04: ArrowDown on the focused day-type cell cycles the type IN PLACE and commits', () => {
    const commits: string[] = [];
    render(<Host onCommit={(v) => commits.push(v)} />);

    const cell = dayTypeCell(0);
    cell.focus();
    expect(document.activeElement).toBe(cell);

    fireEvent.keyDown(cell, { key: 'ArrowDown' });

    // The committed value must have CHANGED. This is the exact assertion that
    // was missing while the arrows sat inert on production.
    expect(commits.length).toBeGreaterThan(0);
    expect(commits[0]).not.toBe('rehearsal');
  });

  it('KEY-04: arrows do NOT open a popup (no listbox / search box appears)', () => {
    render(<Host />);
    const cell = dayTypeCell(0);
    cell.focus();
    fireEvent.keyDown(cell, { key: 'ArrowDown' });

    expect(document.querySelector('[data-lp-dropdown]')).toBeNull();
    expect(screen.queryByPlaceholderText('Type to filter…')).toBeNull();
  });

  it('KEY-04: ArrowUp cycles the other way and also commits', () => {
    const commits: string[] = [];
    render(<Host onCommit={(v) => commits.push(v)} />);
    const cell = dayTypeCell(0);
    cell.focus();
    fireEvent.keyDown(cell, { key: 'ArrowUp' });
    expect(commits.length).toBeGreaterThan(0);
    expect(commits[0]).not.toBe('rehearsal');
  });

  it('KEY-05: the next focusable after the day-type cell is the venue input (Tab is never swallowed)', () => {
    render(<Host />);
    const cell = dayTypeCell(0);
    const venue = venueInput(0);

    // The contract relies on NATIVE tab order: the day-type trigger and the venue
    // input must be adjacent focusables inside the row, with nothing swallowing
    // Tab between them. jsdom doesn't move focus on Tab, so assert the DOM order
    // that native Tab follows.
    const focusables = Array.from(
      document.querySelectorAll<HTMLElement>('input, button, select, textarea, a[href], [tabindex]:not([tabindex="-1"])'),
    ).filter((el) => !el.hasAttribute('disabled') && !el.closest('[data-lp-dropdown]'));

    const ci = focusables.indexOf(cell);
    const vi_ = focusables.indexOf(venue);
    expect(ci).toBeGreaterThanOrEqual(0);
    expect(vi_).toBe(ci + 1);

    // And the cell must not preventDefault on Tab.
    const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    cell.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });
});

/* ============================================
   The ACTUAL production sequence Cowork ran (F-1). The tests above focus the
   cell programmatically; a real user CLICKS it. That difference is the bug.
   ============================================ */
describe('routing ledger — the click-then-arrow path (F-1 repro)', () => {
  it('KEY-04: after CLICKING the day-type cell, ArrowDown still cycles the value', () => {
    const commits: string[] = [];
    render(<Host onCommit={(v) => commits.push(v)} />);
    const cell = dayTypeCell(0);

    // What a user actually does.
    fireEvent.click(cell);
    fireEvent.keyDown(cell, { key: 'ArrowDown' });

    expect(commits.length).toBeGreaterThan(0);
    expect(commits[0]).not.toBe('rehearsal');
  });
});

/* ============================================
   Tour-builder fix (2026-08-05) — the day-type popup's Enter contract.
   Enter in the filter box selects the highlighted type, CLOSES the menu, and
   ADVANCES to the venue cell — Adam's "enter should select the highlight and
   move to the next entry point". Pills are never Tab stops.
   ============================================ */
describe('day-type popup — Enter selects, closes, advances', () => {
  it('type-ahead → Enter commits the match, closes the popup, focuses the venue input', async () => {
    const commits: string[] = [];
    render(<Host onCommit={(v) => commits.push(v)} />);
    const cell = dayTypeCell(0);
    cell.focus();

    // Type-ahead opens the popup seeded with "s" (matches "show" first).
    fireEvent.keyDown(cell, { key: 's' });
    const search = await screen.findByPlaceholderText('Type to filter…');

    fireEvent.keyDown(search, { key: 'Enter' });

    expect(commits).toContain('show');
    expect(screen.queryByPlaceholderText('Type to filter…')).toBeNull();
    expect(document.activeElement).toBe(venueInput(0));
  });

  it('pills are not Tab stops, and Tab from anywhere in the popup exits to the venue cell', async () => {
    render(<Host />);
    const cell = dayTypeCell(0);
    cell.focus();
    fireEvent.keyDown(cell, { key: 's' });
    const search = await screen.findByPlaceholderText('Type to filter…');

    const pills = document.querySelectorAll('[data-lp-dropdown] button');
    expect(pills.length).toBeGreaterThan(0);
    for (const p of pills) expect((p as HTMLButtonElement).tabIndex).toBe(-1);

    fireEvent.keyDown(search, { key: 'Tab' });
    expect(document.activeElement).toBe(venueInput(0));
    expect(screen.queryByPlaceholderText('Type to filter…')).toBeNull();
  });
});

/* ============================================
   LOWPASS — VenueAutocomplete contract (tour-builder fix, 2026-08-05)

   Pins the three behaviours Adam walked and found broken:

     1. The search SEARCHES. With a thin library, typing runs Google Places
        automatically — no "Create new" gate between typing and results.
     2. Enter selects the highlight AND advances to the next entry point,
        exactly like Tab. With no list open, Enter commits the free text and
        still advances — never a dead key.
     3. The list is never in the Tab order (tabIndex -1 on every option), so
        Tab moves cell → cell, not through list rows.

   Rendered bare (not inside the ledger) with a sibling input after it, so
   "advances to the next entry point" is observable as real focus movement.
   ============================================ */

import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { VenueAutocomplete, type LibraryVenueMatch } from './VenueAutocomplete';

const LIB_APOLLO: LibraryVenueMatch = {
  id: 'v1', name: 'O2 Apollo Manchester', city: 'Manchester', country: 'UK',
  address: 'Stockport Rd', capacity: 3500, lat: 53.46, lng: -2.23,
};

/** fetch mock: library hits only for "apollo"; Google always offers Roundhouse. */
function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.startsWith('/api/venues/canonical/search')) {
        const q = decodeURIComponent(u.split('q=')[1] ?? '').toLowerCase();
        const venues = q.includes('apollo') ? [LIB_APOLLO] : [];
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ venues }) });
      }
      if (u.startsWith('/api/places/autocomplete')) {
        void init;
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ suggestions: [{ placeId: 'p-round', text: 'Roundhouse, Chalk Farm Rd, London' }] }),
        });
      }
      if (u.startsWith('/api/places/details')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              displayName: 'Roundhouse',
              formattedAddress: 'Chalk Farm Rd, London NW1 8EH',
              locality: 'London', country: 'UK', latitude: 51.543, longitude: -0.152,
            }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }),
  );
}

beforeEach(() => {
  stubFetch();
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


function mount(overrides: Partial<React.ComponentProps<typeof VenueAutocomplete>> = {}) {
  const onChange = vi.fn();
  const onPlaceSelect = vi.fn();
  const onLibrarySelect = vi.fn();
  render(
    <>
      <VenueAutocomplete
        value=""
        onChange={onChange}
        onPlaceSelect={onPlaceSelect}
        onLibrarySelect={onLibrarySelect}
        placeholder="Venue"
        {...overrides}
      />
      <input data-testid="next-cell" placeholder="City" />
    </>,
  );
  const input = screen.getByPlaceholderText('Venue');
  return { input, onChange, onPlaceSelect, onLibrarySelect };
}

describe('the search searches — no create-new gate', () => {
  it('typing with a thin library runs Google automatically and shows its rows', async () => {
    const { input } = mount();
    input.focus();
    fireEvent.change(input, { target: { value: 'roundhouse' } });

    await waitFor(() => {
      expect(screen.getByText('Roundhouse, Chalk Farm Rd, London')).toBeTruthy();
    });
    // And it is labelled as the Google path, after any library rows.
    expect(screen.getByText('Google')).toBeTruthy();
    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
    expect(calls.some((u) => u.startsWith('/api/places/autocomplete'))).toBe(true);
  });

  it('a rich library short-circuits Google', async () => {
    const { input } = mount();
    input.focus();
    fireEvent.change(input, { target: { value: 'apollo' } });

    await waitFor(() => {
      expect(screen.getByText('O2 Apollo Manchester')).toBeTruthy();
    });
    // Library hit rendered; the old "Create …" gate is gone entirely.
    expect(screen.queryByText(/as a new venue/)).toBeNull();
  });
});

describe('Enter selects the highlight and ADVANCES — like Tab', () => {
  it('Enter on a Google highlight picks it and moves focus to the next cell', async () => {
    const { input, onPlaceSelect } = mount();
    input.focus();
    fireEvent.change(input, { target: { value: 'roundhouse' } });
    await waitFor(() => expect(screen.getByText('Roundhouse, Chalk Farm Rd, London')).toBeTruthy());

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(document.activeElement).toBe(screen.getByTestId('next-cell'));
    await waitFor(() => expect(onPlaceSelect).toHaveBeenCalled());
    expect(onPlaceSelect.mock.calls[0][0].venue_name).toBe('Roundhouse');
  });

  it('Enter on a library highlight links it and advances', async () => {
    const { input, onLibrarySelect } = mount();
    input.focus();
    fireEvent.change(input, { target: { value: 'apollo' } });
    await waitFor(() => expect(screen.getByText('O2 Apollo Manchester')).toBeTruthy());

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onLibrarySelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'v1' }));
    expect(document.activeElement).toBe(screen.getByTestId('next-cell'));
  });

  it('Enter with NO list commits the free text and still advances — never dead', () => {
    const { input, onChange } = mount();
    input.focus();
    // Type and hit Enter before the debounce fires — no dropdown exists yet.
    fireEvent.change(input, { target: { value: 'Private Rehearsal Barn' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('Private Rehearsal Barn');
    expect(document.activeElement).toBe(screen.getByTestId('next-cell'));
  });
});

describe('the list is never in the Tab order', () => {
  it('every option row is tabIndex -1', async () => {
    const { input } = mount();
    input.focus();
    fireEvent.change(input, { target: { value: 'roundhouse' } });
    await waitFor(() => expect(screen.getByText('Roundhouse, Chalk Farm Rd, London')).toBeTruthy());

    const options = document.querySelectorAll('[data-lp-dropdown] button');
    expect(options.length).toBeGreaterThan(0);
    for (const b of options) {
      expect((b as HTMLButtonElement).tabIndex).toBe(-1);
    }
  });
});

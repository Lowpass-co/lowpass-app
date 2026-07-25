/* ============================================
   LOWPASS — the visit ping must never race the page load (fixpack /touch 503)

   Two properties under test, both of which were false before:
     1. Nothing is requested synchronously on mount — the ping waits for idle, so
        it cannot compete with the page's own payload on a cold lambda.
     2. When it does fire it uses sendBeacon, whose failures the browser owns and
        which therefore cannot surface as a console error on a healthy page.
   ============================================ */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { TourVisitTracker } from './TourVisitTracker';

let idleCbs: Array<() => void>;

beforeEach(() => {
  idleCbs = [];
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true })));
  // Capture the idle callback instead of running it, so "deferred" is observable.
  (window as unknown as { requestIdleCallback: unknown }).requestIdleCallback = (cb: () => void) => {
    idleCbs.push(cb);
    return idleCbs.length;
  };
  (window as unknown as { cancelIdleCallback: unknown }).cancelIdleCallback = () => {};
  Object.defineProperty(navigator, 'sendBeacon', { value: vi.fn(() => true), configurable: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TourVisitTracker — fire-and-forget, never on the critical path', () => {
  it('issues NO request on mount (the ping is deferred to idle)', () => {
    render(<TourVisitTracker tourId="t1" />);
    expect(navigator.sendBeacon).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(idleCbs.length).toBe(1); // it did schedule one
  });

  it('uses sendBeacon (not fetch) once idle arrives', () => {
    render(<TourVisitTracker tourId="t1" />);
    act(() => idleCbs.forEach((cb) => cb()));

    expect(navigator.sendBeacon).toHaveBeenCalledTimes(1);
    expect((navigator.sendBeacon as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('/api/tours/t1/touch');
    // fetch must NOT be used when beacon is available — a fetch rejection is what
    // logged the 503 to the console in the first place.
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not fire if unmounted before idle runs', () => {
    const { unmount } = render(<TourVisitTracker tourId="t1" />);
    unmount();
    act(() => idleCbs.forEach((cb) => cb()));
    expect(navigator.sendBeacon).not.toHaveBeenCalled();
  });
});

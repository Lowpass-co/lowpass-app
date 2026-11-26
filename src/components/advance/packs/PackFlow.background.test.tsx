/* The info-pack read runs on the server (Nov 2026, Adam: "SLOW, and gives
   you no info on how long it'll take, and doesnt encourage you to close the
   window and come back").

   The sheet follows a read by polling, says how long reads usually take and
   that you can close it; a read you walked away from waits on the show
   (banner → Review opens it where it left off). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/advance/t1/r1',
}));

import { PackFlow } from './PackFlow';
import { PackReadsBanner } from './PackReadsBanner';

type Call = { url: string; method: string; body: Record<string, unknown> | null };
let calls: Call[];
let readState: 'reading' | 'done';

const result = {
  files: [{ path: 'advance-packs/ws/t1/1-pack.pdf', name: 'pack.pdf', kind: 'text', mime: 'text/plain', pageCount: 1, error: null, found: 1, failedParts: 0, textPages: [{ num: 1, text: 'Power 125A' }] }],
  suggestions: [{ section_id: 'power', field_id: 'main', value: '125A', quote: 'Power 125A', page: 1, verified: true, confidence: 'high', file: 0 }],
  extras: [],
  unanswered: [],
  labels: { 'power:main': { section: 'Power', label: 'Main power', type: 'text' } },
  existing: {},
  sections: [{ template_id: 'power', label: 'Power' }],
};

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn(); // jsdom has none; the review list scrolls
  calls = [];
  readState = 'reading';
  globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    const method = init?.method ?? 'GET';
    calls.push({ url: u, method, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (u.includes('packs/read?pending=1')) {
      return new Response(JSON.stringify({ reads: [{ id: 'read-1', routingId: 'r1', status: readState, createdAt: new Date().toISOString(), found: readState === 'done' ? 1 : 0 }] }), { status: 200 });
    }
    if (u.includes('packs/read?read=read-1')) {
      const base = { id: 'read-1', routingId: 'r1', status: readState, files: [{ path: result.files[0].path, name: 'pack.pdf', size: 1000, type: 'text/plain' }], partsTotal: 3, partsDone: readState === 'done' ? 3 : 1, startedAt: new Date().toISOString(), error: null };
      return new Response(JSON.stringify(readState === 'done' ? { ...base, result } : base), { status: 200 });
    }
    if (u.includes('packs/read') && method === 'PATCH') return new Response(null, { status: 204 });
    return new Response('{}', { status: 200 });
  }) as typeof fetch;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const shows = [{ routingId: 'r1', date: '2026-12-01', venue: 'Leeds Hall', city: 'Leeds' }];

describe('PackFlow — reading in the background', () => {
  it('shows progress, how long it usually takes, and that you can close it; then the answers', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onClose = vi.fn();
    render(<PackFlow tourId="t1" initialFiles={[]} shows={shows} fixedRoutingId="r1" resumeRead={{ id: 'read-1', routingId: 'r1' }} onClose={onClose} />);
    expect(await screen.findByText(/1 of 3 parts read/)).toBeTruthy();
    expect(screen.getByText(/left|longer than usual/)).toBeTruthy();
    expect(screen.getByText(/You don’t have to wait here/)).toBeTruthy();
    expect(screen.getByText(/Leeds Hall’s advance/)).toBeTruthy();
    // The file list comes from the read itself.
    expect(screen.getByText('pack.pdf')).toBeTruthy();

    readState = 'done';
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600);
    });
    expect((await screen.findAllByText('Main power')).length).toBeGreaterThan(0);
    expect(screen.queryByText(/You don’t have to wait here/)).toBeNull();
  });

  it('“Close — I’ll come back” closes without asking', async () => {
    const onClose = vi.fn();
    render(<PackFlow tourId="t1" initialFiles={[]} shows={shows} fixedRoutingId="r1" resumeRead={{ id: 'read-1', routingId: 'r1' }} onClose={onClose} />);
    fireEvent.click(await screen.findByRole('button', { name: /Close — I’ll come back/ }));
    expect(onClose).toHaveBeenCalledWith(false);
  });
});

describe('PackReadsBanner', () => {
  it('a finished read waits on the show: Review opens it, Put aside marks it reviewed', async () => {
    readState = 'done';
    const onReview = vi.fn();
    render(<PackReadsBanner tourId="t1" routingId="r1" shows={shows} onReview={onReview} />);
    expect(await screen.findByText(/1 suggested answer to review/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(onReview).toHaveBeenCalledWith({ id: 'read-1', routingId: 'r1' });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Put aside' }));
    });
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ read: 'read-1', reviewed: true });
    expect(screen.queryByText(/suggested answer/)).toBeNull();
  });

  it('a read still going says so, and the board names the show', async () => {
    render(<PackReadsBanner tourId="t1" shows={shows} onReview={vi.fn()} />);
    expect(await screen.findByText(/Still reading the info pack/)).toBeTruthy();
    expect(screen.getByText(/Leeds Hall/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Watch' })).toBeTruthy();
  });
});

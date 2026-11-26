/* Sections without the wait (Nov 2026, Adam: "add section has way too much
   delay … adding 5 sections took 10-20 seconds" and "renamed sections didn't
   save").

   Add section used to POST, refresh the page and remount the grid — seconds
   each, and a rename typed during a remount was lost. Now the section shows
   the moment it's named, saves in the background, and whatever is done to it
   before the save lands (rename, add a line) waits for the real id. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/budget/t1',
}));

import { BudgetGridView } from './BudgetGridView';
import type { BudgetSection } from '@/types';

type Call = { url: string; method: string; body: Record<string, unknown> | null };
let calls: Call[];
let releasePost: (() => void) | null;

beforeEach(() => {
  calls = [];
  releasePost = null;
  refresh.mockClear();
  globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    calls.push({ url: String(url), method, body });
    if (String(url).startsWith('/api/budget/sections') && method === 'POST') {
      // Hold the save so the test can act before it lands.
      await new Promise<void>((r) => (releasePost = r));
      return new Response(JSON.stringify({ id: 'sec-real', tour_id: 't1', name: body?.name, kind: 'custom', sort_order: body?.sort_order }), { status: 200 });
    }
    if (String(url).startsWith('/api/budget/line-items') && method === 'POST') {
      return new Response(JSON.stringify({ id: 'line-new', section_id: body?.section_id, label: 'New line item', proposed_cost: 0, actual_cost: 0 }), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;
});
afterEach(cleanup);

const sections: BudgetSection[] = [
  { id: 's-prod', tour_id: 't1', name: 'Production', kind: 'custom', sort_order: 0 } as unknown as BudgetSection,
];

function mount() {
  return render(<BudgetGridView lines={[]} sections={sections} tourCurrency="USD" tourId="t1" />);
}

const addSection = (name: string) => {
  fireEvent.click(screen.getByText(/Add section/));
  const input = document.querySelector('.lp-grid-modal input') as HTMLInputElement;
  fireEvent.change(input, { target: { value: name } });
  fireEvent.keyDown(input, { key: 'Enter' });
};
const sectionTitles = () => [...document.querySelectorAll('.sh-title')].map((e) => e.textContent);

describe('Add section', () => {
  it('shows at once, saves in the background, never refreshes the page', async () => {
    mount();
    addSection('Merch');
    expect(sectionTitles()).toContain('Merch'); // before the save has landed
    const post = calls.find((c) => c.method === 'POST' && c.url === '/api/budget/sections');
    expect(post?.body).toMatchObject({ tour_id: 't1', name: 'Merch', kind: 'custom', sort_order: 1 });
    await act(async () => {
      releasePost?.();
    });
    expect(refresh).not.toHaveBeenCalled();
    expect(sectionTitles()).toContain('Merch');
  });

  it('a rename before the save lands goes to the REAL id once it exists', async () => {
    mount();
    addSection('Merch');
    // rename the still-saving section
    const title = [...document.querySelectorAll('.sh-title')].find((e) => e.textContent === 'Merch')!;
    fireEvent.doubleClick(title);
    const input = document.querySelector('.lp-grid-modal input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Merch & VIP' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(sectionTitles()).toContain('Merch & VIP');
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false); // waits for the id
    await act(async () => {
      releasePost?.();
    });
    await vi.waitFor(() =>
      expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ id: 'sec-real', name: 'Merch & VIP' }),
    );
  });

  it('a line added before the save lands is filed under the real section', async () => {
    mount();
    addSection('Merch');
    const head = [...document.querySelectorAll('.sec-head')].find((e) => e.textContent?.includes('Merch'))!;
    fireEvent.contextMenu(head, { clientX: 10, clientY: 10 });
    fireEvent.click(screen.getAllByRole('menuitem').find((m) => m.textContent === 'Add line')!);
    expect(calls.some((c) => c.url === '/api/budget/line-items')).toBe(false);
    await act(async () => {
      releasePost?.();
    });
    await vi.waitFor(() =>
      expect(calls.find((c) => c.url === '/api/budget/line-items')?.body).toMatchObject({ section_id: 'sec-real' }),
    );
  });

  it('a failed save takes the section back off the screen', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ error: 'nope' }), { status: 500 })) as typeof fetch;
    mount();
    addSection('Merch');
    expect(sectionTitles()).toContain('Merch');
    await vi.waitFor(() => expect(sectionTitles()).not.toContain('Merch'));
  });

  it('Cancel adds nothing', () => {
    mount();
    fireEvent.click(screen.getByText(/Add section/));
    fireEvent.click(screen.getByText('Cancel'));
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });
});

describe('Rename', () => {
  it('a failed rename says so (it used to be swallowed)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ error: 'Section not found' }), { status: 404 })) as typeof fetch;
    mount();
    fireEvent.doubleClick([...document.querySelectorAll('.sh-title')].find((e) => e.textContent === 'Production')!);
    const input = document.querySelector('.lp-grid-modal input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Sound' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await vi.waitFor(() => expect(warn.mock.calls.some((c) => /Could not rename the section — Section not found/.test(String(c[1])))).toBe(true));
    expect(refresh).toHaveBeenCalled();
    warn.mockRestore();
  });
});

/* ============================================
   LOWPASS — clicking a nav item has to LOOK like something happened

   From the S-1 smoke walk: "there's no interaction when you click a menu item,
   it just loads silently then the new screen appears." A route change can take
   a second on a cold lambda, and for that second an app that heard the click is
   indistinguishable from one that didn't.

   Real pending state comes from Next's router, which jsdom has no part of, so
   these tests replace `useLinkStatus` and hold every link in one state at a
   time. What that pins is the thing that actually broke: given "this link is
   loading", does the UI say so — and does it stay silent when nothing is.
   ============================================ */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';

const status = vi.hoisted(() => ({ pending: false }));

vi.mock('next/link', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/link')>();
  return { ...actual, useLinkStatus: () => status };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

import { AppShellV3 } from './AppShellV3';

const T = 'tour-123';

function mount(pathname: string, extra: Record<string, unknown> = {}) {
  return render(
    <AppShellV3 pathname={pathname} search="" {...extra}>
      <div>page body</div>
    </AppShellV3>,
  );
}

/** Is there a spinner inside this specific control? */
const spinning = (testId: string) =>
  within(screen.getByTestId(testId)).queryAllByTestId('nav-pending-spinner').length > 0;

beforeEach(() => {
  status.pending = false;
});

describe('nothing is loading', () => {
  it('no spinner and no highlight anywhere — silence is correct when idle', () => {
    mount(`/operations/${T}/routing`);
    expect(screen.queryAllByTestId('nav-pending-spinner')).toHaveLength(0);
    expect(screen.queryAllByTestId('nav-pending-tint')).toHaveLength(0);
  });

  it('the rail item keeps its own icon', () => {
    mount(`/operations/${T}/routing`);
    expect(spinning('nav-item-crew')).toBe(false);
  });
});

describe('a rail item that is loading says so', () => {
  it('its icon becomes a spinner', () => {
    status.pending = true;
    mount(`/operations/${T}/routing`);
    expect(spinning('nav-item-crew')).toBe(true);
  });

  it('it takes the active look immediately, before the page arrives', () => {
    /* The optimistic part: you clicked it, so it starts looking selected. */
    status.pending = true;
    mount(`/operations/${T}/routing`);
    const tint = within(screen.getByTestId('nav-item-crew')).getByTestId('nav-pending-tint');
    expect(tint.style.borderLeft).toContain('var(--lp-orange)');
  });

  it('the marker reaches back over the row’s own 2px border, so it lands where the real one does', () => {
    status.pending = true;
    mount(`/operations/${T}/routing`);
    const tint = within(screen.getByTestId('nav-item-crew')).getByTestId('nav-pending-tint');
    expect(tint.style.left).toBe('-2px');
  });

  it('the row is a positioned ancestor, or the overlay would escape it', () => {
    status.pending = true;
    mount(`/operations/${T}/routing`);
    expect(screen.getByTestId('nav-item-crew').style.position).toBe('relative');
  });

  it('a screen reader is told too', () => {
    status.pending = true;
    mount(`/operations/${T}/routing`);
    expect(screen.getByTestId('nav-item-crew').textContent).toContain('Loading Crew');
  });

  it('works collapsed, where the icon is the ONLY thing there is', () => {
    status.pending = true;
    mount(`/operations/${T}/routing`, { denseRail: true });
    expect(screen.getByTestId('nav-rail').getAttribute('data-collapsed')).toBe('true');
    expect(spinning('nav-item-crew')).toBe(true);
  });

  it('every live item in the rail can show it, not just the one I checked', () => {
    status.pending = true;
    mount(`/operations/${T}/routing`);
    for (const id of ['routing', 'day-sheets', 'advance', 'crew', 'rooming', 'files']) {
      expect(spinning(`nav-item-${id}`)).toBe(true);
    }
  });
});

describe('a dead item never pretends to load', () => {
  it('Travel has no page, so clicking it can’t be going anywhere', () => {
    /* It renders as a <span>, not a Link — there is no pending state to read.
       This asserts the consequence rather than the mechanism. */
    status.pending = true;
    mount(`/operations/${T}/routing`);
    expect(spinning('nav-item-travel')).toBe(false);
    expect(within(screen.getByTestId('nav-item-travel')).queryByTestId('nav-pending-tint')).toBeNull();
  });
});

describe('the mode pill, which is the longest jump in the app', () => {
  it('shows a spinner where its icon was', () => {
    status.pending = true;
    mount(`/operations/${T}/routing`);
    expect(spinning('mode-money')).toBe(true);
  });

  it('tints translucently — an opaque fill would paint over the label', () => {
    status.pending = true;
    mount(`/operations/${T}/routing`);
    const tint = within(screen.getByTestId('mode-money')).getByTestId('nav-pending-tint');
    expect(tint.style.background).toContain('transparent');
  });

  it('and the label is still readable through it', () => {
    status.pending = true;
    mount(`/operations/${T}/routing`);
    expect(screen.getByTestId('mode-money').textContent).toContain('Money');
  });
});

describe('the ways out of the current scope', () => {
  it('the ↑ link swaps its arrow for the spinner', () => {
    status.pending = true;
    mount(`/operations/${T}/routing`, { artistId: 'a1' });
    expect(spinning('nav-rail-up')).toBe(true);
    // the label survives the swap — only the arrow is the slot
    expect(screen.getByTestId('nav-rail-up').textContent).toMatch(/Artist/);
  });

  it('the workspace mark does the same', () => {
    status.pending = true;
    mount(`/operations/${T}/routing`);
    expect(spinning('top-bar-workspace')).toBe(true);
  });
});

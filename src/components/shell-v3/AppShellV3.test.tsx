/* ============================================
   LOWPASS — the shell renders the right thing for a COLD URL (S-1)

   The hard requirement is deep-link correctness: landing on any URL with no
   prior interaction shows the right scope, the right mode and the right active
   rail item. These tests render the shell with nothing but a pathname — no
   context provider, no store, no click — which is precisely the condition a
   shell built on ambient client state fails under.

   <AppShellV3> is a client component (S-3b fix): it derives the chrome from
   usePathname()/useSearchParams() so it follows soft navigation, falling back
   to its props when the hooks return null. The mock below returns null by
   default — so these cold-URL tests exercise the prop path, exactly as a
   router-less render would — and the live-navigation suite at the bottom sets
   `mockPathname` to drive the hook path.
   ============================================ */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppShellV3 } from './AppShellV3';

let mockPathname: string | null = null;
let mockSearch: URLSearchParams | null = null;

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => mockSearch,
  usePathname: () => mockPathname,
}));

const T = 'tour-123';

beforeEach(() => {
  mockPathname = null;
  mockSearch = null;
});

function mount(pathname: string, search = '', extra: Record<string, unknown> = {}) {
  return render(
    <AppShellV3 pathname={pathname} search={search} {...extra}>
      <div>page body</div>
    </AppShellV3>,
  );
}

describe('the named acceptance case: cold /budget/[id]/settlement', () => {
  it('shows Money mode active and Settlements highlighted, with zero interaction', () => {
    mount(`/budget/${T}/settlement`);
    expect(screen.getByTestId('mode-money').getAttribute('data-active')).toBe('true');
    expect(screen.getByTestId('mode-tour').getAttribute('data-active')).toBeNull();
    expect(screen.getByTestId('nav-item-settlements').getAttribute('data-active')).toBe('true');
  });

  it('the rail head names the MODE, so pill and rail agree', () => {
    mount(`/budget/${T}/settlement`);
    expect(screen.getByLabelText('MONEY navigation')).toBeTruthy();
  });
});

describe('the mode pill exists ONLY at tour scope', () => {
  it('present on a tour URL', () => {
    mount(`/operations/${T}/routing`);
    expect(screen.getByTestId('mode-pill')).toBeTruthy();
  });

  it.each(['/artists/a1', '/artists', '/settings'])('absent on %s', (p) => {
    mount(p);
    expect(screen.queryByTestId('mode-pill')).toBeNull();
  });
});

describe('each scope renders its own rail', () => {
  it('tour → Routing; production → Assets; artist → Overview; workspace → Artists', () => {
    mount(`/operations/${T}/routing`);
    expect(screen.getByTestId('nav-item-routing').getAttribute('data-active')).toBe('true');

    mount(`/operations/${T}/hire`);
    expect(screen.getAllByTestId('nav-item-assets')[0].getAttribute('data-active')).toBe('true');

    mount('/artists/a1');
    expect(screen.getAllByTestId('nav-item-overview')[0].getAttribute('data-active')).toBe('true');

    mount('/artists');
    expect(screen.getAllByTestId('nav-item-artists')[0].getAttribute('data-active')).toBe('true');
  });

  it('Payroll appears in the MONEY rail from an /operations URL', () => {
    // The route folder says operations; the rail says Money. Both are right.
    mount(`/operations/${T}/payroll`);
    expect(screen.getByTestId('mode-money').getAttribute('data-active')).toBe('true');
    expect(screen.getByTestId('nav-item-payroll').getAttribute('data-active')).toBe('true');
  });
});

describe('pages that don’t exist yet are visible but not clickable', () => {
  it('Travel renders disabled and is not a link', () => {
    /* The REASON used to live in a `title` attribute. The smoke found nothing on
       hover (SHELL-07), so it's a real tooltip now — asserted below. */
    mount(`/operations/${T}/routing`);
    const travel = screen.getByTestId('nav-item-travel');
    expect(travel.getAttribute('aria-disabled')).toBe('true');
    expect(travel.tagName).toBe('SPAN'); // not a link
  });
});

describe('the day rail and the nav rail coexist', () => {
  it('denseRail starts the APP rail collapsed, leaving the day rail its width', () => {
    mount(`/operations/${T}/routing`, '', { denseRail: true });
    expect(screen.getByTestId('nav-rail').getAttribute('data-collapsed')).toBe('true');
  });

  it('without it the rail is expanded', () => {
    mount(`/operations/${T}/routing`);
    expect(screen.getByTestId('nav-rail').getAttribute('data-collapsed')).toBe('false');
  });
});

describe('the way up', () => {
  it('a tour with a known artist offers ↑ Artist', () => {
    mount(`/operations/${T}/routing`, '', { artistId: 'a1' });
    expect(screen.getByTestId('nav-rail-up').textContent).toMatch(/Artist/);
  });

  it('workspace scope offers nothing above it', () => {
    mount('/artists');
    expect(screen.queryByTestId('nav-rail-up')).toBeNull();
  });
});

/* ============================================
   S-1 FIXPACK — what the smoke walk caught (SHELL-06, SHELL-07)

   Both failures were the native `title` attribute: the rail sets
   overflow:hidden for its width transition, which clips anything beside an
   icon, and a native tooltip needs a second of stillness before it appears at
   all. "Nothing on hover", twice.

   Plus a layout bug hiding inside SHELL-06: group headings collapsed from 30px
   to a 17px hairline, so every icon below slid up 13px per group — "hard to
   trace which is which". Muscle memory only works if things stay put.
   ============================================ */

import { fireEvent } from '@testing-library/react';

describe('SHELL-07 — a dead item explains itself', () => {
  it('hovering Travel says why it does nothing', () => {
    mount(`/operations/${T}/routing`);
    fireEvent.mouseEnter(screen.getByTestId('nav-item-travel'));
    expect(screen.getByTestId('nav-tooltip').textContent).toBe('Travel — no page yet');
  });

  it('and it explains itself EXPANDED too, not only collapsed', () => {
    // The rail is expanded here — the label is visible but the deadness isn't.
    mount(`/operations/${T}/routing`);
    expect(screen.getByTestId('nav-rail').getAttribute('data-collapsed')).toBe('false');
    fireEvent.mouseEnter(screen.getByTestId('nav-item-travel'));
    expect(screen.getByTestId('nav-tooltip')).toBeTruthy();
  });

  it('keyboard focus gets the same explanation as the mouse', () => {
    mount(`/operations/${T}/routing`);
    fireEvent.focus(screen.getByTestId('nav-item-travel'));
    expect(screen.getByTestId('nav-tooltip').textContent).toMatch(/no page yet/);
  });

  it('a LIVE item expanded needs no tooltip — its label is right there', () => {
    mount(`/operations/${T}/routing`);
    fireEvent.mouseEnter(screen.getByTestId('nav-item-crew'));
    expect(screen.queryByTestId('nav-tooltip')).toBeNull();
  });
});

describe('SHELL-06 — collapsed icons are identifiable', () => {
  it('a collapsed icon names itself on hover', () => {
    mount(`/operations/${T}/routing`, '', { denseRail: true });
    expect(screen.getByTestId('nav-rail').getAttribute('data-collapsed')).toBe('true');
    fireEvent.mouseEnter(screen.getByTestId('nav-item-crew'));
    expect(screen.getByTestId('nav-tooltip').textContent).toBe('Crew');
  });

  it('the tooltip clears when the pointer leaves', () => {
    mount(`/operations/${T}/routing`, '', { denseRail: true });
    const rail = screen.getByTestId('nav-rail');
    fireEvent.mouseEnter(screen.getByTestId('nav-item-crew'));
    expect(screen.getByTestId('nav-tooltip')).toBeTruthy();
    fireEvent.mouseLeave(rail);
    expect(screen.queryByTestId('nav-tooltip')).toBeNull();
  });

  it('every rail item can name itself when collapsed', () => {
    mount(`/operations/${T}/routing`, '', { denseRail: true });
    for (const id of ['routing', 'day-sheets', 'advance', 'crew', 'rooming', 'travel', 'files']) {
      fireEvent.mouseEnter(screen.getByTestId(`nav-item-${id}`));
      expect(screen.getByTestId('nav-tooltip').textContent).toBeTruthy();
    }
  });
});

describe('SHELL-06 — icons do not move when the rail folds', () => {
  it('a group slot is the same height collapsed as expanded', () => {
    /* The bug: 30px heading → 17px hairline meant everything below shifted up by
       13px per group. Asserting the SLOT height is what pins it, because that is
       the thing that has to match — not the appearance, which is meant to
       differ. */
    const read = (dense: boolean) => {
      const { container, unmount } = mount(`/operations/${T}/routing`, '', { denseRail: dense });
      const rail = container.querySelector('[data-testid="nav-rail"]') as HTMLElement;
      const slots = [...rail.querySelectorAll('div')].filter(
        (d) => (d as HTMLElement).style.height === '30px',
      ).length;
      unmount();
      return slots;
    };
    // Tour mode has two groups; both must reserve a slot in both states.
    expect(read(false)).toBe(2);
    expect(read(true)).toBe(2);
  });
});

describe('S-3b fix — the chrome FOLLOWS soft navigation (the frozen-highlight bug)', () => {
  /* THE BUG: the shell mounted in a LAYOUT, and Next does not re-render a
     layout on soft navigation between its pages — so the active item, the
     mode pill, and even which rail rendered all froze at the first URL. These
     tests drive the hook path (mockPathname non-null) and re-render the SAME
     mount, which is exactly what a soft navigation does to a layout child. */

  function mountLive() {
    const view = render(
      <AppShellV3 pathname="/ignored-when-hook-answers">
        <div>page body</div>
      </AppShellV3>,
    );
    const renav = () =>
      view.rerender(
        <AppShellV3 pathname="/ignored-when-hook-answers">
          <div>page body</div>
        </AppShellV3>,
      );
    return { renav };
  }

  it('the hook wins over the mount prop when a router is present', () => {
    mockPathname = `/operations/${T}/routing`;
    mountLive();
    expect(screen.getByTestId('nav-item-routing').getAttribute('data-active')).toBe('true');
  });

  it('the active item moves across a same-layout navigation', () => {
    mockPathname = `/operations/${T}/routing`;
    const { renav } = mountLive();
    expect(screen.getByTestId('nav-item-routing').getAttribute('data-active')).toBe('true');

    mockPathname = `/operations/${T}/personnel`;
    renav();
    expect(screen.getByTestId('nav-item-crew').getAttribute('data-active')).toBe('true');
    expect(screen.getByTestId('nav-item-routing').getAttribute('data-active')).toBeNull();
  });

  it('the WHOLE RAIL swaps when navigation crosses a mode — not just the highlight', () => {
    /* Routing → Payroll stays inside the /operations layout but crosses from
       the TOUR rail to the MONEY rail. Frozen chrome showed the tour rail with
       nothing lit; live chrome swaps rail, head label and pill together. */
    mockPathname = `/operations/${T}/routing`;
    const { renav } = mountLive();
    expect(screen.getByLabelText('TOUR navigation')).toBeTruthy();

    mockPathname = `/operations/${T}/payroll`;
    renav();
    expect(screen.getByLabelText('MONEY navigation')).toBeTruthy();
    expect(screen.getByTestId('nav-item-payroll').getAttribute('data-active')).toBe('true');
    expect(screen.getByTestId('mode-money').getAttribute('data-active')).toBe('true');
  });

  it('a ?tab= change moves the highlight too — budget tabs are search, not path', () => {
    mockPathname = `/budget/${T}`;
    mockSearch = new URLSearchParams('tab=income');
    const { renav } = mountLive();
    expect(screen.getByTestId('nav-item-income').getAttribute('data-active')).toBe('true');

    mockSearch = new URLSearchParams('tab=receipts');
    renav();
    expect(screen.getByTestId('nav-item-receipts').getAttribute('data-active')).toBe('true');
    expect(screen.getByTestId('nav-item-income').getAttribute('data-active')).toBeNull();
  });
});

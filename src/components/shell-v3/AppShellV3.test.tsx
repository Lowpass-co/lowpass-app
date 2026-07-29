/* ============================================
   LOWPASS — the shell renders the right thing for a COLD URL (S-1)

   The hard requirement is deep-link correctness: landing on any URL with no
   prior interaction shows the right scope, the right mode and the right active
   rail item. These tests render the shell with nothing but a pathname — no
   context provider, no store, no click — which is precisely the condition a
   shell built on ambient client state fails under.

   <AppShellV3> is a server component, but it is a plain synchronous function of
   its props, so it renders in jsdom directly. That is not an accident: keeping
   it free of async data-fetching is what allows the URL→chrome mapping to be
   tested at all.
   ============================================ */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppShellV3 } from './AppShellV3';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

const T = 'tour-123';

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

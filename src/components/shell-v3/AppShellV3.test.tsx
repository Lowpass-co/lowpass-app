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
  it('Travel renders disabled, with a reason', () => {
    mount(`/operations/${T}/routing`);
    const travel = screen.getByTestId('nav-item-travel');
    expect(travel.getAttribute('aria-disabled')).toBe('true');
    expect(travel.getAttribute('title')).toMatch(/no page yet/);
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

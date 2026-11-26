/* Right-click on the Crew list (Nov 2026, Adam: "I want right click menu on
   crew too"). Never the browser's menu when there's something to offer. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/operations/t1/personnel',
}));
vi.mock('@/lib/realtime/useRealtimeRows', () => ({ useRealtimeRows: () => undefined }));
// The two side panels pull in Supabase clients; they aren't what's under test.
vi.mock('./PersonnelManageSlideOver', () => ({
  PersonnelManageSlideOver: ({ open, member }: { open: boolean; member: { display_name: string } | null }) =>
    open && member ? <div data-testid="manage">{member.display_name}</div> : null,
}));
vi.mock('./AddCrewSlideOver', () => ({ AddCrewSlideOver: () => null }));
vi.mock('@/components/personnel/PersonnelDetailSlideOver', () => ({
  PersonnelDetailSlideOver: ({ panel }: { panel: { id: string } | null }) => (panel ? <div data-testid="profile">{panel.id}</div> : null),
}));

import { PersonnelManagerClient } from './PersonnelManagerClient';

const ben = {
  id: 'tp-ben',
  person_id: 'p-ben',
  workspace_id: 'ws',
  display_name: 'ben henry quinton',
  email: 'ben@example.com',
  phone: null,
  role: 'Tour Director',
  role_tag: 'tm',
  employment: 'crew',
  rate_amount: null,
  rate_currency: null,
  rate_period: null,
  starts_on: null,
  ends_on: null,
  canonical_person_id: null,
  login: { state: 'none' },
};

let deleted: string[];
beforeEach(() => {
  deleted = [];
  push.mockClear();
  globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'DELETE') {
      deleted.push(String(url));
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    return new Response(JSON.stringify({ personnel: [ben] }), { status: 200 });
  }) as typeof fetch;
});
afterEach(cleanup);

async function mount(canEdit = true) {
  render(<PersonnelManagerClient tourId="t1" tourStartDate={null} tourEndDate={null} canEdit={canEdit} conflictsOnly={false} />);
  return screen.findByText('Ben Henry Quinton');
}
const labels = () => screen.queryAllByRole('menuitem').map((m) => m.textContent);
const pick = (label: string) =>
  act(() => {
    fireEvent.click(screen.getAllByRole('menuitem').find((m) => m.textContent === label)!);
  });

describe('crew right-click', () => {
  it('our menu, with the crew options', async () => {
    const name = await mount();
    expect(fireEvent.contextMenu(name, { clientX: 5, clientY: 5 })).toBe(false);
    expect(labels()).toEqual(['Edit on this tour', 'Open full profile', 'Rates in Payroll', 'Copy email', 'Remove from tour…']);
  });

  it('Open full profile opens their People record', async () => {
    fireEvent.contextMenu(await mount(), { clientX: 5, clientY: 5 });
    pick('Open full profile');
    expect(screen.getByTestId('profile').textContent).toBe('p-ben');
  });

  it('Edit on this tour opens the tour panel', async () => {
    fireEvent.contextMenu(await mount(), { clientX: 5, clientY: 5 });
    pick('Edit on this tour');
    expect(screen.getByTestId('manage').textContent).toBe('ben henry quinton');
  });

  it('Rates in Payroll goes to Payroll', async () => {
    fireEvent.contextMenu(await mount(), { clientX: 5, clientY: 5 });
    pick('Rates in Payroll');
    expect(push).toHaveBeenCalledWith('/operations/t1/payroll');
  });

  it('Remove asks first, then takes them off this tour', async () => {
    fireEvent.contextMenu(await mount(), { clientX: 5, clientY: 5 });
    pick('Remove from tour…');
    expect(deleted).toEqual([]);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'DELETE' } });
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button').find((b) => /^Delete$|Remove|Confirm/.test(b.textContent ?? '') && !(b as HTMLButtonElement).disabled)!);
    });
    expect(deleted).toEqual(['/api/tours/t1/personnel/tp-ben']);
  });

  it('a viewer who can’t edit gets just Copy email', async () => {
    fireEvent.contextMenu(await mount(false), { clientX: 5, clientY: 5 });
    expect(labels()).toEqual(['Copy email']);
  });
});

/* ============================================
   <ArtistTourPicker> — the behaviours Adam hit:
   "closes between selections and doesn't reliably switch".

   Pins: the tours of the current artist are there on first open (they used to
   be empty); choosing another artist only PREVIEWS (no navigation, panel stays
   open, its tours show at once); choosing a tour navigates exactly once, to
   the same page of the new tour; the keyboard works; no delete in here.
   ============================================ */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within, act } from '@testing-library/react';
import { ArtistTourPicker } from './ArtistTourPicker';
import type { PickerArtist, PickerTour } from '@/lib/nav/pickerModel';

const push = vi.fn();
const openCreateTour = vi.fn();
let pathname = '/budget/sp';
let search = 'tab=budget';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock('@/contexts/TourEditorContext', () => ({ useTourEditor: () => ({ openCreateTour }) }));
vi.mock('@/components/shell-v2/ArtistCreateSlideOver', () => ({ ArtistCreateSlideOver: () => null }));

const artists: PickerArtist[] = [
  { id: 'cs', name: 'Charlotte Sands', imageUrl: null },
  { id: 'gn', name: 'Good Neighbours', imageUrl: null },
  { id: 'au', name: 'AU/RA', imageUrl: null },
];
const year = new Date().getUTCFullYear();
const tours: PickerTour[] = [
  { id: 'sp', name: 'Simple Plan Support', artistId: 'cs', startDate: `${year - 1}-01-01`, endDate: `${year + 1}-12-31` },
  { id: 'sat', name: 'Satellite USA Headline', artistId: 'cs', startDate: `${year - 2}-09-06`, endDate: `${year - 2}-09-28` },
  { id: 'gn1', name: 'Spring Run', artistId: 'gn', startDate: `${year + 2}-04-08`, endDate: `${year + 2}-04-19` },
];

function mount(props: Partial<Parameters<typeof ArtistTourPicker>[0]> = {}) {
  return render(<ArtistTourPicker artists={artists} tours={tours} currentArtistId="cs" currentTourId="sp" {...props} />);
}

beforeEach(() => {
  push.mockReset();
  openCreateTour.mockReset();
  pathname = '/budget/sp';
  search = 'tab=budget';
});

describe('<ArtistTourPicker>', () => {
  it('trigger names the artist and the tour, each its own button', () => {
    mount();
    expect(screen.getByTestId('picker-trigger').textContent).toContain('Charlotte Sands');
    expect(screen.getByTestId('picker-trigger-tour').textContent).toContain('Simple Plan Support');
  });

  it("the current artist's tours are there on first open (they used to be empty)", () => {
    mount();
    fireEvent.click(screen.getByTestId('picker-trigger-tour'));
    const names = screen.getAllByTestId('picker-tour').map((b) => b.textContent);
    expect(names.some((n) => n?.includes('Simple Plan Support'))).toBe(true);
    expect(screen.getByText("You're here")).toBeTruthy();
    // past tours are tucked away while a live one exists
    expect(screen.getByText('Show 1 past tour')).toBeTruthy();
  });

  it('choosing another artist previews it — no navigation, panel stays open', () => {
    mount();
    fireEvent.click(screen.getByTestId('picker-trigger'));
    const gn = screen.getAllByTestId('picker-artist').find((b) => b.textContent?.includes('Good Neighbours'))!;
    fireEvent.click(gn);
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByTestId('picker-panel')).toBeTruthy();
    expect(screen.getAllByTestId('picker-tour').map((b) => b.textContent).join()).toContain('Spring Run');
  });

  it('choosing a tour navigates once, to the same page of that tour', () => {
    mount();
    fireEvent.click(screen.getByTestId('picker-trigger'));
    fireEvent.click(screen.getAllByTestId('picker-artist').find((b) => b.textContent?.includes('Good Neighbours'))!);
    fireEvent.click(screen.getAllByTestId('picker-tour').find((b) => b.textContent?.includes('Spring Run'))!);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/budget/gn1?tab=budget');
    expect(screen.queryByTestId('picker-panel')).toBeNull();
  });

  it('an artist with no tours says so and offers a new tour for that artist', () => {
    mount();
    fireEvent.click(screen.getByTestId('picker-trigger'));
    fireEvent.click(screen.getAllByTestId('picker-artist').find((b) => b.textContent?.includes('AU/RA'))!);
    expect(screen.getByText(/Create one to open Operations, Budget and Advance for AU\/RA/)).toBeTruthy();
    fireEvent.click(screen.getByText(/New tour for AU\/RA/));
    expect(openCreateTour).toHaveBeenCalledWith({ artistId: 'au' });
  });

  it('search finds a tour and Enter opens it', () => {
    mount();
    fireEvent.click(screen.getByTestId('picker-trigger-tour'));
    const box = screen.getByLabelText('Search artists and tours');
    fireEvent.change(box, { target: { value: 'spring' } });
    expect(screen.getAllByTestId('picker-artist').map((b) => b.textContent)).toEqual([expect.stringContaining('Good Neighbours')]);
    // →: into the tours column; Enter opens the highlighted tour
    fireEvent.keyDown(box, { key: 'ArrowRight' });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(push).toHaveBeenCalledWith('/budget/gn1?tab=budget');
  });

  it('Esc closes; clicking outside closes', () => {
    mount();
    fireEvent.click(screen.getByTestId('picker-trigger'));
    fireEvent.keyDown(screen.getByLabelText('Search artists and tours'), { key: 'Escape' });
    expect(screen.queryByTestId('picker-panel')).toBeNull();
    fireEvent.click(screen.getByTestId('picker-trigger'));
    act(() => {
      document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    });
    expect(screen.queryByTestId('picker-panel')).toBeNull();
  });

  it('no delete action anywhere in the picker', () => {
    mount();
    fireEvent.click(screen.getByTestId('picker-trigger'));
    expect(within(screen.getByTestId('picker-panel')).queryByText(/delete/i)).toBeNull();
  });

  it('on a product landing with nothing chosen it invites a choice, and opens that product', () => {
    pathname = '/advance';
    search = '';
    mount({ currentArtistId: null, currentTourId: null, landing: true });
    expect(screen.getByTestId('picker-trigger').textContent).toContain('Choose an artist and tour');
    fireEvent.click(screen.getByTestId('picker-trigger'));
    fireEvent.click(screen.getAllByTestId('picker-tour').find((b) => b.textContent?.includes('Simple Plan Support'))!);
    expect(push).toHaveBeenCalledWith('/advance/sp');
  });

  it('on a tour page the artist comes from the tour when the layout did not say', () => {
    mount({ currentArtistId: null });
    expect(screen.getByTestId('picker-trigger').textContent).toContain('Charlotte Sands');
  });
});

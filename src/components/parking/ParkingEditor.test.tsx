/* The parking editor: adding a vehicle saves a map the server accepts, and a
   409 shows the conflict banner instead of overwriting. */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ToastProvider } from '@/components/ui/Toast';
import { ParkingEditor } from './ParkingEditor';
import { parseMapBody, parseView } from '@/lib/parking/model';
import type { ParkingShow, SavedParkingMap } from '@/server/parking/maps';

const show: ParkingShow = {
  tourId: 't1',
  routingId: 'r1',
  workspaceId: 'w',
  date: '2026-12-01',
  dayType: 'show',
  venue: { name: 'First Direct Arena', address: null, city: 'Leeds', canonicalId: 'cv', coords: { lat: 53.8027, lng: -1.5432 } },
};

class RO {
  constructor(private cb: ResizeObserverCallback) {}
  observe() {
    this.cb([{ contentRect: { width: 1000, height: 700 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
  disconnect() {}
  unobserve() {}
}

let calls: { method: string; body: unknown }[] = [];
let reply: (body: { map: unknown; version: number | null }) => Response;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('ResizeObserver', RO);
  calls = [];
  reply = (b) => new Response(JSON.stringify({ map: { ...(b.map as object), id: 'm', version: (b.version ?? 0) + 1, updatedAt: new Date().toISOString(), pdf: null } }), { status: 200 });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ method: init?.method ?? 'GET', body });
      return init?.method === 'PUT' ? reply(body) : new Response('{}', { status: 200 });
    }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const mount = (initial: SavedParkingMap | null = null, canEdit = true) =>
  render(
    <ToastProvider>
      <ParkingEditor show={show} tourName="Tour" initial={initial} canEdit={canEdit} />
    </ToastProvider>,
  );

describe('ParkingEditor', () => {
  it('opening writes nothing', async () => {
    mount();
    await act(async () => vi.advanceTimersByTime(3000));
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(0);
  });

  it('adding a bus saves, once, a body the server gate accepts; the next save names the new version', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Tour bus, EU \/ UK/ }));
    expect(screen.getByDisplayValue('Bus 1')).toBeTruthy();
    await act(async () => vi.advanceTimersByTime(1000));
    const puts = calls.filter((c) => c.method === 'PUT');
    expect(puts).toHaveLength(1);
    const b = puts[0].body as { map: unknown; version: number | null };
    expect(b.version).toBeNull();
    expect(parseMapBody(b.map).items[0]).toMatchObject({ kind: 'vehicle', type: 'bus_eu', length: 13.5 });

    fireEvent.click(screen.getByRole('button', { name: /Truck, EU/ }));
    await act(async () => vi.advanceTimersByTime(1000));
    const second = calls.filter((c) => c.method === 'PUT')[1].body as { version: number };
    expect(second.version).toBe(1);
  });

  it('a colour is one click, saved, and one undo step', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Tour bus, EU \/ UK/ }));
    await act(async () => vi.advanceTimersByTime(1000));
    fireEvent.click(screen.getByRole('radio', { name: 'Teal' }));
    await act(async () => vi.advanceTimersByTime(1000));
    const last = () => calls.filter((c) => c.method === 'PUT').at(-1)!.body as { map: { items: { colour?: string }[] } };
    expect(last().map.items[0].colour).toBe('teal');
    expect(screen.getByRole('radio', { name: 'Teal' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await act(async () => vi.advanceTimersByTime(1000));
    expect(last().map.items[0].colour).toBeUndefined();
  });

  it('a 409 shows the conflict and stops saving', async () => {
    reply = () => new Response(JSON.stringify({ error: 'x', current: { id: 'm', version: 7, items: [], notes: 'theirs', view: { cx: 0, cy: 0, ppm: 2, rotation: 0 }, anchor: show.venue.coords, updatedAt: '', pdf: null } }), { status: 409 });
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Car \/ runner/ }));
    await act(async () => vi.advanceTimersByTime(1000));
    expect(screen.getByText(/changed somewhere else/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Car \/ runner/ }));
    await act(async () => vi.advanceTimersByTime(3000));
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Load theirs' }));
    expect(screen.getByDisplayValue('theirs')).toBeTruthy();
  });

  it('read-only members get no tools and never save', async () => {
    mount(null, false);
    expect(screen.queryByRole('button', { name: /Tour bus/ })).toBeNull();
    expect(screen.getByText('View only')).toBeTruthy();
    await act(async () => vi.advanceTimersByTime(3000));
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(0);
  });

  it('no venue position: asks where it is, and accepts pasted coordinates', async () => {
    render(
      <ToastProvider>
        <ParkingEditor show={{ ...show, venue: { ...show.venue, coords: null } }} tourName={null} initial={null} canEdit />
      </ToastProvider>,
    );
    const box = screen.getByRole('textbox', { name: /Venue address or coordinates/ });
    fireEvent.change(box, { target: { value: '53.8027, -1.5432' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Find' }));
    });
    expect(screen.getByRole('heading', { name: 'Parking' })).toBeTruthy();
    expect(calls.some((c) => c.method === 'GET')).toBe(false); // pasted numbers: no geocode call
  });
});

describe('PDF pages', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  it('starts with Plan + 3D; adding a plan view, renaming and reordering are saved on the view', async () => {
    mount();
    const names = () => screen.getAllByRole('textbox', { name: /Page \d name/ }).map((i) => (i as HTMLInputElement).value);
    expect(names()).toEqual(['Plan', '3D']);
    fireEvent.click(screen.getByRole('button', { name: /This plan view/ }));
    expect(names()).toEqual(['Plan', '3D', 'Plan 2']);
    fireEvent.change(screen.getByRole('textbox', { name: 'Page 3 name' }), { target: { value: 'Approach' } });
    fireEvent.click(screen.getByRole('button', { name: 'Move page 3 up' }));
    expect(names()).toEqual(['Plan', 'Approach', '3D']);
    fireEvent.click(screen.getByRole('button', { name: 'Remove page 3' }));
    await act(async () => vi.advanceTimersByTime(1000));
    const body = calls.filter((c) => c.method === 'PUT').at(-1)!.body as { map: { view: unknown } };
    const v = parseView(body.map.view);
    expect(v.pages!.map((p) => [p.kind, p.title])).toEqual([['plan', 'Plan'], ['plan', 'Approach']]);
  });

  it('the last page can’t be removed', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Remove page 2' }));
    expect((screen.getByRole('button', { name: 'Remove page 1' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('several at once (Cmd/Ctrl-click, ⌘A)', () => {
  beforeEach(() => {
    // jsdom has no pointer capture.
    Element.prototype.setPointerCapture = () => {};
  });
  const twoBuses = (): SavedParkingMap => ({
    id: 'm',
    version: 3,
    updatedAt: new Date().toISOString(),
    anchor: { lat: 53.8027, lng: -1.5432 },
    view: { cx: 0, cy: 0, ppm: 3, rotation: 0 },
    notes: '',
    pdf: null,
    items: [
      { id: 'a', kind: 'vehicle', type: 'bus_eu', label: 'Bus 1', x: -5, y: 0, heading: 0, length: 13.5, width: 2.55, height: 4 },
      { id: 'b', kind: 'vehicle', type: 'bus_eu', label: 'Bus 2', x: 5, y: 0, heading: 0, length: 13.5, width: 2.55, height: 4 },
      { id: 'g', kind: 'marker', type: 'gate', label: '', detail: '', x: 40, y: 0 },
    ],
  });
  const lastItems = () => (parseMapBody((calls.filter((c) => c.method === 'PUT').at(-1)!.body as { map: unknown }).map).items);
  const hits = (c: HTMLElement) => [...c.querySelectorAll('polygon[fill="transparent"]')];
  const mapEl = (c: HTMLElement) => c.querySelector('.pk-map')!;

  it('Cmd-click adds, Ctrl-click takes out, and the panel says what is picked', () => {
    const { container } = mount(twoBuses());
    const [a, b] = hits(container);
    fireEvent.pointerDown(a, { button: 0, pointerId: 1 });
    fireEvent.pointerUp(mapEl(container), { pointerId: 1 });
    expect(screen.getByDisplayValue('Bus 1')).toBeTruthy();
    fireEvent.pointerDown(b, { button: 0, pointerId: 2, metaKey: true });
    fireEvent.pointerUp(mapEl(container), { pointerId: 2 });
    expect(screen.getByText('2 selected')).toBeTruthy();
    fireEvent.pointerDown(a, { button: 0, pointerId: 3, ctrlKey: true });
    fireEvent.pointerUp(mapEl(container), { pointerId: 3 });
    expect(screen.queryByText('2 selected')).toBeNull();
    expect(screen.getByDisplayValue('Bus 2')).toBeTruthy();
  });

  it('⌘A picks everything; Turn right 5° turns them as one block; Delete removes all; ⌘Z brings all back', async () => {
    mount(twoBuses());
    fireEvent.keyDown(window, { key: 'a', metaKey: true });
    expect(screen.getByText('3 selected')).toBeTruthy();
    expect(screen.getByText('2 vehicles · 1 marker')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Turn right 45°' }));
    await act(async () => vi.advanceTimersByTime(1000));
    const turned = lastItems();
    const [a, b] = turned as Extract<(typeof turned)[number], { kind: 'vehicle' }>[];
    expect([a.heading, b.heading]).toEqual([45, 45]);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(10, 2); // still 10 m apart: a row stays a row

    fireEvent.keyDown(window, { key: 'Delete' });
    await act(async () => vi.advanceTimersByTime(1000));
    expect(lastItems()).toHaveLength(0);

    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    await act(async () => vi.advanceTimersByTime(1000));
    expect(lastItems().map((i) => i.id)).toEqual(['a', 'b', 'g']);
  });

  it('arrows nudge every picked item; colour paints only the vehicles', async () => {
    mount(twoBuses());
    fireEvent.keyDown(window, { key: 'a', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'ArrowRight', shiftKey: true });
    fireEvent.click(screen.getByRole('radio', { name: 'Teal' }));
    await act(async () => vi.advanceTimersByTime(1000));
    const out = lastItems();
    expect(out.map((i) => (i.kind === 'vehicle' || i.kind === 'marker' ? i.x : null))).toEqual([-4, 6, 41]);
    expect(out.map((i) => (i.kind === 'vehicle' ? i.colour : 'n/a'))).toEqual(['teal', 'teal', 'n/a']);
  });
});

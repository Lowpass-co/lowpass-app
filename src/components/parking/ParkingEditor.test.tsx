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

let calls: { method: string; body: unknown; url: string }[] = [];
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
      calls.push({ method: init?.method ?? 'GET', body, url: String(_url) });
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

    // A new vehicle is selected (its edit view replaces the tabs); Done goes back to Add.
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    fireEvent.click(screen.getByRole('button', { name: /Car \/ runner/ }));
    await act(async () => vi.advanceTimersByTime(3000));
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Load theirs' }));
    if (screen.queryByRole('button', { name: 'Done' })) fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Share' }));
    expect(screen.getByDisplayValue('theirs')).toBeTruthy();
  });

  it('read-only members get no tools and never save', async () => {
    mount(null, false);
    expect(screen.queryByRole('button', { name: /Tour bus/ })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Add' })).toBeNull();
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
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy(); // the editor, titled with the venue
    expect(calls.some((c) => c.url.includes('geocode'))).toBe(false); // pasted numbers: no geocode call
  });
});

describe('the panel: Add · Drawings · Share (Nov 2026)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  it('UK / EU sizes by default in Leeds; US flips the tiles to US sizes', () => {
    mount();
    expect(screen.getByRole('button', { name: /Truck, EU \(artic\), 16.5/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'US' }));
    expect(screen.queryByRole('button', { name: /Truck, EU/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Truck, US \(53 ft\), 22/ })).toBeTruthy();
  });
  it('Drawings and Share hold their own sections; Export stays in the header', () => {
    mount();
    expect(screen.getByRole('button', { name: /Export PDF/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Drawings' }));
    expect(screen.getByRole('button', { name: /Add a venue drawing/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Tour bus/ })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Share' }));
    expect(screen.getByRole('button', { name: /Send to a driver/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Export PDF/ })).toBeTruthy();
  });
});

describe('right-click on the plan (Nov 2026)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  it('the empty map: our menu, not the browser’s — add a vehicle right there', async () => {
    mount();
    const map = screen.getByRole('application', { name: /Parking map for/ });
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 });
    await act(async () => {
      map.dispatchEvent(ev);
    });
    expect(ev.defaultPrevented).toBe(true);
    expect(screen.getByRole('menu')).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: /Sprinter/ }));
    expect(screen.queryByRole('menu')).toBeNull();
    await act(async () => vi.advanceTimersByTime(1000));
    const put = calls.filter((c) => c.method === 'PUT').at(-1)!.body as { map: unknown };
    expect(parseMapBody(put.map).items.map((i) => i.kind === 'vehicle' && i.type)).toEqual(['sprinter']);
  });
  it('Flatten 3D is a draw tool on the Add tab', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Flatten 3D/ }));
    expect(screen.getByText(/Draw round what to flatten/)).toBeTruthy();
  });
  it('every marker name reads in full (no truncated tiles)', () => {
    mount();
    for (const name of ['Load-in door', 'Shore power', 'Gate / entrance', 'Height limit', 'Dump / waste']) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
  });
});

describe('PDF pages', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  it('starts with Plan + 3D; adding a plan view, renaming and reordering are saved on the view', async () => {
    mount();
    fireEvent.click(screen.getByRole('tab', { name: 'Share' }));
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
    fireEvent.click(screen.getByRole('tab', { name: 'Share' }));
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
    drawings: [],
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

describe('venue drawings: levels and last time at this venue', () => {
  const dock = {
    id: 'dock', fileId: '7e3f2a10-4b5c-4d6e-8f70-112233445566', name: 'Basement dock.pdf', kind: 'pdf' as const, page: 1, srcW: 1000, srcH: 600,
    crop: { u0: 0, v0: 0, u1: 1000, v1: 600 }, scale: 0.1, calib: null, x: -50, y: 30, rotation: 0, pinned: true, pinCheck: 0.4,
    opacity: 0.85, hidden: false, inside: true, floor: -5, clearHeight: null, insideArea: null,
  };
  const withDock = (): SavedParkingMap => ({
    id: 'm', version: 2, updatedAt: new Date().toISOString(), anchor: { lat: 52.4547, lng: -1.7206 },
    view: { cx: 0, cy: 0, ppm: 3, rotation: 0 }, notes: '', pdf: null, items: [], drawings: [dock],
  });
  const lastMap = () => (calls.filter((c) => c.method === 'PUT').at(-1)!.body as { map: unknown }).map;

  it('a basement drawing makes two levels; picking one puts new things on it', async () => {
    mount(withDock());
    expect(screen.getByRole('button', { name: 'All levels' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Basement dock (−5 m)' }));
    fireEvent.click(screen.getByRole('button', { name: /Truck, EU/ }));
    await act(async () => vi.advanceTimersByTime(1000));
    const m = parseMapBody(lastMap());
    expect(m.view.level).toBe(-5);
    expect(m.items[0]).toMatchObject({ kind: 'vehicle', floor: -5 });
    expect(m.drawings).toHaveLength(1);
  });

  it('offers last time’s drawings at this venue, moved into this map’s frame', async () => {
    const reuse = { routingId: 'old', updatedAt: '2026-03-01T00:00:00Z', anchor: { lat: 52.4547, lng: -1.7206 }, drawings: [dock] };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const body = init?.body ? JSON.parse(String(init.body)) : null;
        calls.push({ method: init?.method ?? 'GET', body, url: String(url) });
        if (String(url).includes('/drawings')) return new Response(JSON.stringify({ files: [], reuse }), { status: 200 });
        return init?.method === 'PUT' ? reply(body) : new Response('{}', { status: 200 });
      }),
    );
    mount({ ...withDock(), drawings: [], anchor: { lat: 52.4548, lng: -1.7206 } });
    fireEvent.click(screen.getByRole('tab', { name: 'Drawings' }));
    // Let the drawings fetch resolve (fake timers: flush microtasks by hand).
    for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); });
    fireEvent.click(screen.getByRole('button', { name: 'Use it' }));
    await act(async () => vi.advanceTimersByTime(1000));
    const [d] = parseMapBody(lastMap()).drawings;
    // This map's pin is ~11 m north of last time's: the drawing moves 11 m south in this frame.
    expect(d.x).toBeCloseTo(-50, 1);
    expect(d.y).toBeCloseTo(30 - 11.1, 0);
  });
});

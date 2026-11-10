/* Parking maps — the PDF's pages. */

import { describe, expect, it } from 'vitest';
import { add3dPage, addPlanPage, defaultPages, movePage, pagesOf, planFrame, removePage, screenScale, updatePage, MAX_PAGES, type PdfPage } from './pages';
import { parseView, ParkingInputError, type ParkingItem } from './model';
import type { View } from './geo';

const view: View = { cx: 10, cy: -5, ppm: 2, rotation: 30 };
const screen = { w: 1200, h: 800 };
const cam = { x: -50, y: -90, alt: 120, heading: 20, pitch: -35, roll: 0 };
const bus: ParkingItem = { id: 'b', kind: 'vehicle', type: 'bus_eu', label: 'Bus', x: 0, y: 0, heading: 0, length: 13.5, width: 2.55, height: 4 };

describe('pages', () => {
  it('a map without pages prints the plan and the 3D view (with its saved camera)', () => {
    expect(pagesOf({}).map((p) => p.kind)).toEqual(['plan', '3d']);
    const d = pagesOf({ cam3d: cam });
    expect(d[1]).toMatchObject({ kind: '3d', cam });
  });

  it('adding a plan view keeps that centre, rotation and a scale that fits the screen on paper', () => {
    const pages = addPlanPage(defaultPages(), view, screen);
    const p = pages[2];
    expect(p).toMatchObject({ kind: 'plan', fit: false, cx: 10, cy: -5, rotation: 30, title: 'Plan 2' });
    if (p.kind === 'plan' && !p.fit) {
      // 600 m of screen across 196 mm → 1:5,000 (the smallest standard scale ≥ 1:3,061).
      expect(p.scale).toBe(screenScale(view, screen));
      expect((p.scale * 196) / 1000).toBeGreaterThanOrEqual(screen.w / view.ppm);
    }
  });

  it('adding a 3D view, reordering, renaming and removing', () => {
    let pages: PdfPage[] = add3dPage(defaultPages(), cam);
    expect(pages.map((p) => p.title)).toEqual(['Plan', '3D', '3D 2']);
    const id = pages[2].id;
    pages = movePage(pages, id, -1);
    expect(pages.map((p) => p.title)).toEqual(['Plan', '3D 2', '3D']);
    expect(movePage(pages, pages[0].id, -1)).toBe(pages); // already first
    pages = updatePage(pages, id, { title: 'From the gate' });
    expect(pages[1].title).toBe('From the gate');
    pages = removePage(pages, 'plan');
    expect(pages.map((p) => p.kind)).toEqual(['3d', '3d']);
  });

  it('stops at the page limit', () => {
    let pages: PdfPage[] = [];
    for (let i = 0; i < MAX_PAGES + 3; i++) pages = add3dPage(pages, cam);
    expect(pages).toHaveLength(MAX_PAGES);
  });

  it('a fixed plan page prints its own frame and rotation; a fit page follows the drawing and the editor', () => {
    const fixed = addPlanPage([], { ...view, rotation: 75 }, screen)[0];
    if (fixed.kind !== 'plan') throw new Error();
    const a = planFrame(fixed, [bus], view, screen);
    expect(a.rotation).toBe(75);
    expect([a.frame.cx, a.frame.cy]).toEqual([10, -5]);
    const fit = planFrame({ id: 'p', kind: 'plan', title: 'Plan', fit: true, scale: 'auto' }, [bus], view, screen);
    expect(fit.rotation).toBe(30);
    expect(Math.hypot(fit.frame.cx, fit.frame.cy)).toBeLessThan(1); // centred on the bus
    expect(fit.frame.scale).toBeLessThanOrEqual(500);
  });
});

describe('parsePages — through parseView', () => {
  it('round-trips every page kind', () => {
    const pages = add3dPage(addPlanPage(defaultPages(), view, screen), cam);
    const out = parseView({ ...view, pages: JSON.parse(JSON.stringify(pages)) });
    expect(out.pages).toEqual(pages);
  });

  const bad: [string, unknown][] = [
    ['not a list', {}],
    ['an unknown kind', [{ id: 'a', kind: 'video', title: 'x' }]],
    ['a made-up scale', [{ id: 'a', kind: 'plan', title: 'x', fit: false, cx: 0, cy: 0, rotation: 0, scale: 333 }]],
    ['a fixed page with no centre', [{ id: 'a', kind: 'plan', title: 'x', fit: false, rotation: 0, scale: 500 }]],
    ['two pages, one id', [{ id: 'a', kind: '3d', title: 'x', cam: null }, { id: 'a', kind: '3d', title: 'y', cam: null }]],
    ['too many pages', Array.from({ length: MAX_PAGES + 1 }, (_, i) => ({ id: `p${i}`, kind: '3d', title: 'x', cam: null }))],
    ['a camera underground', [{ id: 'a', kind: '3d', title: 'x', cam: { ...cam, alt: -9999 } }]],
  ];
  it.each(bad)('refuses %s', (_n, pages) => {
    expect(() => parseView({ ...view, pages })).toThrow(ParkingInputError);
  });

  it('caps a long title, and names an untitled page', () => {
    const out = parseView({ ...view, pages: [{ id: 'a', kind: '3d', title: 'x'.repeat(200), cam: null }, { id: 'b', kind: '3d', title: '  ', cam: null }] });
    expect(out.pages![0].title).toHaveLength(60);
    expect(out.pages![1].title).toBe('Page');
  });
});

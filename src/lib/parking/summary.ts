/* One line describing a parking map, for the advance card. */

import { vehicleSpec } from './catalogue';
import type { ParkingItem } from './model';

export function summariseMap(items: ParkingItem[]): string | null {
  const byShort = new Map<string, number>();
  let markers = 0;
  let areas = 0;
  let routes = 0;
  for (const i of items) {
    if (i.kind === 'vehicle') {
      const s = vehicleSpec(i.type)?.short.toLowerCase() ?? 'vehicle';
      byShort.set(s, (byShort.get(s) ?? 0) + 1);
    } else if (i.kind === 'marker') markers++;
    else if (i.kind === 'area') areas++;
    else if (i.kind === 'route') routes++;
  }
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : w.endsWith('s') ? 'es' : 's'}`;
  const parts = [...byShort.entries()].map(([w, n]) => plural(n, w));
  if (markers) parts.push(plural(markers, 'marker'));
  if (areas) parts.push(plural(areas, 'area'));
  if (routes) parts.push(plural(routes, 'route'));
  return parts.length ? parts.join(' · ') : null;
}

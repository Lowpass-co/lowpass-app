/* ============================================
   LOWPASS — Gear manifest + carnet export data loader (S1 D-1)

   ONE loader for BOTH documents, because they are the same rows read two ways:
   the manifest is the internal packing document (grouped by space → container,
   with weight subtotals) and the carnet general list is the customs document
   (flat, numbered, in carnet column order). Splitting the query would let the
   two disagree about what is in the truck, which is the one thing they must
   never do.

   Read-only. Caller has already auth'd and workspace-scoped.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveArtistLogoUrlSync } from '@/lib/artists/imageUrl';

export type GearExportScope =
  | { kind: 'workspace' }
  | { kind: 'space'; spaceId: string }
  | { kind: 'tour'; tourId: string };

export interface GearExportItem {
  id: string;
  name: string | null;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  country_of_origin: string | null;
  customs_hs_code: string | null;
  weight_kg: number | null;
  value_amount: number | null;
  /** D1-L1 — the carnet value falls back to this; see resolveCarnetValue. */
  purchase_cost: number | null;
  value_currency: string | null;
  dimensions_cm: string | null;
  space_id: string | null;
  container_id: string | null;
}

export interface GearExportGroup {
  /** Space name, or the explicit unplaced bucket — never an empty heading. */
  spaceName: string;
  containers: { containerName: string; items: GearExportItem[]; weightKg: number }[];
  weightKg: number;
}

export interface GearExportData {
  items: GearExportItem[];
  groups: GearExportGroup[];
  totalWeightKg: number;
  scopeLabel: string;
  logoUrl: string | null;
  artistName: string | null;
}

const SELECT =
  'id, name, manufacturer, model, serial_number, country_of_origin, customs_hs_code, ' +
  'weight_kg, value_amount, purchase_cost, value_currency, dimensions_cm, space_id, container_id';

/** Items with no space, and containers with no name, still have to appear —
 *  a manifest that quietly drops the unplaced items is worse than useless when
 *  you are counting cases onto a truck. */
const UNPLACED_SPACE = 'Unplaced';
const LOOSE_CONTAINER = 'Loose items';

export async function loadGearExportData(
  supabase: SupabaseClient,
  workspaceId: string,
  scope: GearExportScope,
): Promise<GearExportData> {
  let items: GearExportItem[] = [];
  let scopeLabel = 'All gear';

  if (scope.kind === 'tour') {
    /* tour_gear is the link table; the manifest for a tour is the gear assigned
       to it, not everything in the workspace. */
    const { data: links } = await supabase
      .from('tour_gear')
      .select('gear_id')
      .eq('workspace_id', workspaceId)
      .eq('tour_id', scope.tourId);
    const ids = (links ?? []).map((l) => (l as { gear_id: string }).gear_id).filter(Boolean);
    if (ids.length > 0) {
      const { data } = await supabase.from('gear').select(SELECT).eq('workspace_id', workspaceId).in('id', ids);
      items = (data ?? []) as unknown as GearExportItem[];
    }
    const { data: tour } = await supabase.from('tours').select('name').eq('id', scope.tourId).maybeSingle();
    scopeLabel = (tour as { name?: string } | null)?.name ?? 'Tour gear';
  } else {
    let q = supabase.from('gear').select(SELECT).eq('workspace_id', workspaceId);
    if (scope.kind === 'space') q = q.eq('space_id', scope.spaceId);
    const { data } = await q;
    items = (data ?? []) as unknown as GearExportItem[];
    if (scope.kind === 'space') {
      const { data: sp } = await supabase.from('spaces').select('name').eq('id', scope.spaceId).maybeSingle();
      scopeLabel = (sp as { name?: string } | null)?.name ?? 'Space';
    }
  }

  const spaceIds = [...new Set(items.map((i) => i.space_id).filter(Boolean))] as string[];
  const containerIds = [...new Set(items.map((i) => i.container_id).filter(Boolean))] as string[];
  const spaceNames = new Map<string, string>();
  const containerNames = new Map<string, string>();
  if (spaceIds.length) {
    const { data } = await supabase.from('spaces').select('id, name').in('id', spaceIds);
    for (const s of data ?? []) spaceNames.set((s as { id: string }).id, (s as { name: string }).name);
  }
  if (containerIds.length) {
    const { data } = await supabase.from('containers').select('id, name').in('id', containerIds);
    for (const c of data ?? []) containerNames.set((c as { id: string }).id, (c as { name: string }).name);
  }

  /* Group space → container. Weight subtotals roll UP: container → space →
     grand total, each computed from the same item list so they reconcile. */
  const bySpace = new Map<string, Map<string, GearExportItem[]>>();
  for (const it of items) {
    const sName = (it.space_id && spaceNames.get(it.space_id)) || UNPLACED_SPACE;
    const cName = (it.container_id && containerNames.get(it.container_id)) || LOOSE_CONTAINER;
    if (!bySpace.has(sName)) bySpace.set(sName, new Map());
    const m = bySpace.get(sName)!;
    if (!m.has(cName)) m.set(cName, []);
    m.get(cName)!.push(it);
  }
  const weigh = (rows: GearExportItem[]) =>
    Math.round(rows.reduce((s, r) => s + (Number(r.weight_kg) || 0), 0) * 100) / 100;

  const groups: GearExportGroup[] = [...bySpace.entries()]
    .sort(([a], [b]) => (a === UNPLACED_SPACE ? 1 : b === UNPLACED_SPACE ? -1 : a.localeCompare(b)))
    .map(([spaceName, cm]) => {
      const containers = [...cm.entries()]
        .sort(([a], [b]) => (a === LOOSE_CONTAINER ? 1 : b === LOOSE_CONTAINER ? -1 : a.localeCompare(b)))
        .map(([containerName, rows]) => ({ containerName, items: rows, weightKg: weigh(rows) }));
      return { spaceName, containers, weightKg: weigh(containers.flatMap((c) => c.items)) };
    });

  let logoUrl: string | null = null;
  let artistName: string | null = null;
  if (scope.kind === 'tour') {
    const { data: t } = await supabase.from('tours').select('artist_id').eq('id', scope.tourId).maybeSingle();
    const artistId = (t as { artist_id?: string | null } | null)?.artist_id ?? null;
    if (artistId) {
      const { data: a } = await supabase
        .from('artists')
        .select('name, branding, spotify_image_url')
        .eq('id', artistId)
        .maybeSingle();
      artistName = (a as { name?: string } | null)?.name ?? null;
      /* Sync resolver: the fallback chain that would hit Spotify is not worth a
         network round-trip inside a document build. Null is handled. */
      logoUrl = a ? resolveArtistLogoUrlSync(a as Parameters<typeof resolveArtistLogoUrlSync>[0]) : null;
    }
  }

  return { items, groups, totalWeightKg: weigh(items), scopeLabel, logoUrl, artistName };
}

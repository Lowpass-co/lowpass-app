import type { SupabaseClient } from '@supabase/supabase-js';
import { RIDER_ASSETS_BUCKET, signedUrlForAsset } from '@/lib/rider-packs/assets';
import type { FileVm } from '@/lib/tour-files/types';

function guessMime(name: string, hint: string | null | undefined): string | null {
  if (hint && hint.includes('/')) return hint;
  const lower = name.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  return null;
}

function inferSource(linkedToType: string): FileVm['source'] {
  const t = linkedToType.toLowerCase();
  if (t.includes('advance')) return 'advance';
  if (t.includes('person')) return 'personnel';
  return 'other';
}

type AssetRow = {
  id: string;
  label: string;
  asset_type: string;
  storage_path: string | null;
  external_url: string | null;
  created_at: string;
  routing_id: string | null;
  meta: Record<string, unknown> | null;
};

type RefRow = {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_provider: string;
  provider_file_id: string;
  linked_to_type: string;
  linked_to_id: string | null;
  created_at: string;
};

/** Build tour-scoped file rows — rider_assets for this tour + file_references linked to tour or shows on tour. */
export async function buildTourScopedFileVms(
  supabase: SupabaseClient,
  opts: { tourId: string; workspaceId: string },
): Promise<FileVm[]> {
  const rows: FileVm[] = [];

  const { data: assets } = await supabase
    .from('rider_assets')
    .select(
      `
      id,
      label,
      asset_type,
      storage_path,
      external_url,
      created_at,
      routing_id,
      meta
    `,
    )
    .eq('workspace_id', opts.workspaceId)
    .eq('tour_id', opts.tourId);

  for (const a of (assets ?? []) as AssetRow[]) {
    const previewUrl = await signedUrlForAsset(supabase, {
      asset_type: a.asset_type,
      storage_path: a.storage_path,
      external_url: a.external_url,
    });
    const meta = a.meta ?? {};
    const sizeBytes = typeof meta.size_bytes === 'number' ? meta.size_bytes : null;
    const mime = typeof meta.mime_type === 'string' ? meta.mime_type : guessMime(a.label ?? '', null);
    rows.push({
      id: `asset:${a.id}`,
      source: 'rider-pack',
      filename: a.label || 'Untitled asset',
      mimeType: mime,
      size: sizeBytes,
      uploadedAt: a.created_at,
      uploadedByName: null,
      showId: a.routing_id,
      personId: null,
      riderPackId: null,
      storageBucket: RIDER_ASSETS_BUCKET,
      storagePath: a.storage_path ?? '',
      externalUrl: a.external_url,
      previewUrl,
      linkedSummary: a.routing_id ? 'Show / routing' : 'Tour rider asset',
      linkedHref: null,
    });
  }

  const { data: tourRefs } = await supabase
    .from('file_references')
    .select('*')
    .eq('workspace_id', opts.workspaceId)
    .eq('linked_to_type', 'tour')
    .eq('linked_to_id', opts.tourId);

  const { data: routingRows } = await supabase.from('routing').select('id').eq('tour_id', opts.tourId);
  const routingIds = new Set((routingRows ?? []).map((r) => r.id));

  let showRefs: RefRow[] = [];
  if (routingIds.size > 0) {
    const { data: byRouting } = await supabase
      .from('file_references')
      .select('*')
      .eq('workspace_id', opts.workspaceId)
      .eq('linked_to_type', 'routing')
      .in('linked_to_id', [...routingIds]);
    showRefs = (byRouting ?? []) as RefRow[];
  }

  for (const f of [...((tourRefs ?? []) as RefRow[]), ...showRefs]) {
    const showId =
      typeof f.linked_to_id === 'string' && routingIds.has(f.linked_to_id) ? f.linked_to_id : null;
    rows.push({
      id: `ref:${f.id}`,
      source: inferSource(f.linked_to_type),
      filename: f.file_name,
      mimeType: guessMime(f.file_name, f.file_type),
      size: f.file_size,
      uploadedAt: f.created_at,
      uploadedByName: null,
      showId,
      personId: null,
      riderPackId: null,
      storageBucket: f.storage_provider || 'google_drive',
      storagePath: f.provider_file_id,
      externalUrl: null,
      previewUrl: null,
      linkedSummary: `${f.linked_to_type} · ${(f.linked_to_id ?? '').slice(0, 8)}`,
      linkedHref: null,
    });
  }

  return rows.sort((x, y) => new Date(y.uploadedAt).getTime() - new Date(x.uploadedAt).getTime());
}

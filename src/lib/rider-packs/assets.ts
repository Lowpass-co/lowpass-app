/* ============================================
   LOWPASS — Rider/Pack asset helpers

   Path convention: {workspace_id}/{artist_id}/{uuid}-{filename}
   Workspace prefix is enforced on writes so one workspace can't
   reference another's files by path.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';

export const RIDER_ASSETS_BUCKET = 'rider-assets';

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

export function isValidStoragePathForWorkspace(
  storagePath: string | null | undefined,
  workspaceId: string,
): boolean {
  if (!storagePath || typeof storagePath !== 'string') return false;
  if (!workspaceId) return false;
  // Must start with '{workspace_id}/' and be non-empty after.
  const prefix = `${workspaceId}/`;
  return storagePath.startsWith(prefix) && storagePath.length > prefix.length;
}

/**
 * Given an asset row with storage_path, return a short-lived signed URL.
 * Returns null for non-storage assets (asset_type = 'url') or on error.
 */
export async function signedUrlForAsset(
  supabase: SupabaseClient,
  asset: {
    asset_type: string;
    storage_path: string | null;
    external_url: string | null;
  },
): Promise<string | null> {
  if (asset.asset_type === 'url') return asset.external_url ?? null;
  if (!asset.storage_path) return null;

  const { data, error } = await supabase.storage
    .from(RIDER_ASSETS_BUCKET)
    .createSignedUrl(asset.storage_path, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/** Bulk helper for list endpoints — returns URLs keyed by asset id. */
export async function signedUrlsForAssets(
  supabase: SupabaseClient,
  assets: Array<{
    id: string;
    asset_type: string;
    storage_path: string | null;
    external_url: string | null;
  }>,
): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  for (const a of assets) {
    out[a.id] = await signedUrlForAsset(supabase, a);
  }
  return out;
}

import type { SupabaseClient } from '@supabase/supabase-js';
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

type RefRow = {
  id: string;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
  storage_provider: string;
  provider_file_id: string;
  created_at: string;
};

/** Artist-scoped files — the file_references uploaded against this artist
 *  (linked_to_type='artist'). Read model for the artist-library Files page. */
export async function buildArtistScopedFileVms(
  supabase: SupabaseClient,
  opts: { artistId: string; workspaceId: string },
): Promise<FileVm[]> {
  const { data } = await supabase
    .from('file_references')
    .select('id, file_name, file_type, file_size, storage_provider, provider_file_id, created_at')
    .eq('workspace_id', opts.workspaceId)
    .eq('linked_to_type', 'artist')
    .eq('linked_to_id', opts.artistId);

  return ((data ?? []) as RefRow[])
    .map((f) => ({
      id: `ref:${f.id}`,
      source: 'other' as const,
      filename: f.file_name,
      mimeType: guessMime(f.file_name, f.file_type),
      size: f.file_size,
      uploadedAt: f.created_at,
      uploadedByName: null,
      showId: null,
      personId: null,
      riderPackId: null,
      storageBucket: f.storage_provider || 'tour-files',
      storagePath: f.provider_file_id,
      externalUrl: null,
      previewUrl: null,
      linkedSummary: 'Artist file',
      linkedHref: null,
    }))
    .sort((x, y) => new Date(y.uploadedAt).getTime() - new Date(x.uploadedAt).getTime());
}

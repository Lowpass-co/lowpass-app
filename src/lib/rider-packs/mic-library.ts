import type { SupabaseClient } from '@supabase/supabase-js';
import type { MicLibraryEntry } from './types';

type MicRow = {
  id: string;
  name: string;
  type: MicLibraryEntry['type'];
  default_phantom: boolean;
};

function mapRow(r: MicRow): MicLibraryEntry {
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    default_phantom: r.default_phantom,
  };
}

export async function listMics(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<MicLibraryEntry[]> {
  const { data, error } = await supabase
    .from('mic_library')
    .select('id, name, type, default_phantom')
    .or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`)
    .order('name');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapRow(r as MicRow));
}

export async function createMic(
  supabase: SupabaseClient,
  args: { workspaceId: string; name: string; type: MicLibraryEntry['type']; default_phantom: boolean },
): Promise<MicLibraryEntry> {
  const { data, error } = await supabase
    .from('mic_library')
    .insert({
      workspace_id: args.workspaceId,
      name: args.name,
      type: args.type,
      default_phantom: args.default_phantom,
    })
    .select('id, name, type, default_phantom')
    .single();
  if (error) throw new Error(error.message);
  return mapRow(data as MicRow);
}

import { createServerSupabaseClient } from '@/lib/supabase-server';
import type { ShellData, ShellTopBarTour } from '@/lib/shell/types';
import type { TourStatus } from '@/types';

function mapTourStatus(s: TourStatus | string): 'active' | 'archived' {
  if (s === 'archived' || s === 'completed') return 'archived';
  return 'active';
}

/**
 * Server-only: current user, profile display fields, and workspace tours for the TopBar tour menu.
 * Pure given the same session + database state; safe to call from any app route layout/page.
 */
export async function getShellData(): Promise<ShellData> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { user: null, tours: [] };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id, name, avatar_url')
    .eq('id', user.id)
    .maybeSingle();

  const email = user.email ?? '';
  const name = (profile?.name as string | null)?.trim() || email || 'Account';

  let tours: ShellTopBarTour[] = [];
  if (profile?.workspace_id) {
    const { data: tourRows } = await supabase
      .from('tours')
      .select('id, name, status')
      .eq('workspace_id', profile.workspace_id)
      .order('start_date', { ascending: false });
    tours = (tourRows ?? []).map((r: { id: string; name: string; status: string }) => ({
      id: r.id,
      name: r.name,
      status: mapTourStatus(r.status),
    }));
  }

  return {
    user: {
      name,
      email,
      avatarUrl: (profile?.avatar_url as string | null) ?? null,
    },
    tours,
  };
}

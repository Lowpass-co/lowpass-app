import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import type { TemplateKind } from '@/lib/types/template-vm';
import { listUnifiedTemplates } from '@/lib/templates/listUnifiedTemplates';

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const kind = (searchParams.get('kind') ?? '') as TemplateKind | '';
  const q = searchParams.get('q') ?? undefined;
  const updatedAfter = searchParams.get('updated_after');
  const updatedBefore = searchParams.get('updated_before');

  try {
    const templates = await listUnifiedTemplates(supabase, {
      kind: kind || undefined,
      q,
      updatedAfter,
      updatedBefore,
    });
    return NextResponse.json({ templates });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

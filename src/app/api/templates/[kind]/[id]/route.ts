import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import type { TemplateKind } from '@/lib/types/template-vm';
import { getUnifiedTemplate } from '@/lib/templates/listUnifiedTemplates';

const KINDS: TemplateKind[] = ['rider-pack', 'advance-layout', 'advance-schedule', 'budget', 'other'];

type Params = { params: Promise<{ kind: string; id: string }> };

export async function GET(_: Request, { params }: Params) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { kind: rawKind, id } = await params;
  const decodedKind = decodeURIComponent(rawKind);
  const kind = KINDS.includes(decodedKind as TemplateKind) ? (decodedKind as TemplateKind) : null;

  if (!kind) return NextResponse.json({ error: 'Invalid template kind' }, { status: 400 });

  try {
    const template = await getUnifiedTemplate(supabase, kind, id);
    if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ template });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

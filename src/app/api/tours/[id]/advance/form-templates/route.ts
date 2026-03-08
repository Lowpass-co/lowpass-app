/* ============================================
   LOWPASS — Tour Advance Form Templates

   GET: List saved form config templates for this tour (reusable layouts)
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

async function ensureAuth() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null };
  return { supabase, user };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, user } = await ensureAuth();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: tourId } = await params;
  const { data: tour } = await supabase
    .from('tours')
    .select('id')
    .eq('id', tourId)
    .single();

  if (!tour) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  }

  const { data: templates, error } = await supabase
    .from('advance_form_configs')
    .select('id, name, template_label, sections')
    .eq('tour_id', tourId)
    .eq('is_template', true)
    .order('template_label');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    templates: (templates ?? []).map((t) => ({
      id: t.id,
      name: t.template_label ?? t.name,
      sections: t.sections ?? [],
    })),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, user } = await ensureAuth();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: tourId } = await params;
  const { data: tour } = await supabase
    .from('tours')
    .select('id')
    .eq('id', tourId)
    .single();

  if (!tour) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  }

  let body: { template_label: string; sections: unknown[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const template_label = typeof body.template_label === 'string' ? body.template_label.trim() : '';
  const sections = Array.isArray(body.sections) ? body.sections : [];
  if (!template_label) {
    return NextResponse.json({ error: 'template_label is required' }, { status: 400 });
  }

  const { data: created, error } = await supabase
    .from('advance_form_configs')
    .insert({
      tour_id: tourId,
      routing_id: null,
      name: template_label,
      template_label,
      is_template: true,
      is_default: false,
      sections,
      created_by_id: user.id,
    })
    .select('id, template_label, sections')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    id: created.id,
    name: created.template_label,
    sections: created.sections ?? [],
  });
}

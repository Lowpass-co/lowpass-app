/* ============================================
   LOWPASS — AI Line Item Suggestions

   POST: tour_id, line_item (id, category, label, proposed_cost, routing_id), context.
   Returns 1-3 short, actionable suggestions (ephemeral, not stored).
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Suggestions not configured' }, { status: 503 });
  }

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();

  if (!profile?.workspace_id) {
    return NextResponse.json({ error: 'No workspace' }, { status: 403 });
  }

  let body: {
    tour_id: string;
    line_item: { id?: string; category?: string; label?: string; proposed_cost?: number; routing_id?: string | null };
    context?: { category?: string; label?: string; proposed_cost?: number };
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { tour_id, line_item } = body;
  if (!tour_id) {
    return NextResponse.json({ error: 'tour_id required' }, { status: 400 });
  }

  const context = body.context ?? line_item;
  const category = context.category ?? line_item.category ?? '';
  const label = context.label ?? line_item.label ?? '';
  const proposedCost = context.proposed_cost ?? line_item.proposed_cost ?? 0;

  const { data: tour } = await supabase
    .from('tours')
    .select('id, name, currency')
    .eq('id', tour_id)
    .eq('workspace_id', profile.workspace_id)
    .single();

  if (!tour) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  }

  const { data: routing } = await supabase
    .from('routing')
    .select('id, date, day_type')
    .eq('tour_id', tour_id)
    .order('date');

  const showCount = (routing ?? []).filter((r: { day_type: string }) => r.day_type === 'show' || r.day_type === 'festival').length;
  const lineItems = await supabase
    .from('budget_line_items')
    .select('category, label, proposed_cost')
    .eq('tour_id', tour_id)
    .eq('workspace_id', profile.workspace_id);

  const hasCarnet = (lineItems.data ?? []).some(
    (i: { label?: string }) => (i.label ?? '').toLowerCase().includes('carnet')
  );
  const hasHaulage = (lineItems.data ?? []).some(
    (i: { label?: string }) => (i.label ?? '').toLowerCase().match(/haulage|freight|truck/)
  );

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: `You are a tour budget assistant. Given this line item and tour context, suggest 1-3 brief, actionable tips. Be subtle and specific.

Line item: category="${category}", label="${label}", proposed_cost=${proposedCost}
Tour: ${(tour as { name?: string }).name ?? ''}, ${showCount} show days.
Other budgeted items include: ${(lineItems.data ?? []).slice(0, 15).map((i: { label?: string }) => i.label).join(', ') || 'none'}.
Carnet budgeted: ${hasCarnet}. Haulage/freight budgeted: ${hasHaulage}.

Return ONLY a JSON array of 1-3 strings, each a short suggestion (e.g. "You usually budget £250/night for hotels in London — is £200 still right?" or "This tour has 3 EU shows but no carnet budgeted."). If nothing useful, return []. No markdown.`,
        },
      ],
    });

    const block = response.content[0];
    const text = block.type === 'text' ? block.text : '';
    const jsonMatch = text.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) {
      return NextResponse.json({ suggestions: [] });
    }

    const suggestions = JSON.parse(jsonMatch[0]);
    return NextResponse.json({
      suggestions: Array.isArray(suggestions) ? suggestions.filter((s: unknown) => typeof s === 'string').slice(0, 3) : [],
    });
  } catch (err) {
    console.error('AI suggest error:', err);
    return NextResponse.json({ suggestions: [] });
  }
}

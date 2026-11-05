/* ============================================
   POST /api/tours/[id]/start-from — a new tour's templates (Nov 2026)

   Body: {
     budgetTemplateId: string | null,          // null = Custom (blank budget)
     money: { management?, agency?, legal?, merch_commission?,
              accountancy?, insurance?, contingency?, merch_cogs? }  // % points; blank = 0
     advanceShow: 'headline' | 'support' | 'festival' | null,          // null = workspace setting
     advanceDaysOff: boolean
   }
   The work is startTourFromTemplates (src/server/templates/startTour.ts).
   ============================================ */

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { requireTourInWorkspace, requireWrite } from '@/lib/auth/workspace-check';
import { startTourFromTemplates, StartFromInputError } from '@/server/templates/startTour';
import { TemplateNotFound } from '@/server/budget/applyTemplate';
import { MONEY_FIELDS, type AdvanceStarterKey, type MoneyInput } from '@/lib/templates/tourTemplates';

const SHOW_STARTERS: AdvanceStarterKey[] = ['headline', 'support', 'festival'];

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: tourId } = await params;
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const gate = await requireTourInWorkspace(supabase, tourId, auth.workspaceId);
  if (gate) return gate as NextResponse;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const budgetTemplateId = typeof body.budgetTemplateId === 'string' && body.budgetTemplateId ? body.budgetTemplateId : null;
  const advanceShow = body.advanceShow == null ? null : String(body.advanceShow);
  if (advanceShow !== null && !SHOW_STARTERS.includes(advanceShow as AdvanceStarterKey)) {
    return NextResponse.json({ error: 'Unknown advance set' }, { status: 400 });
  }
  const rawMoney = (body.money && typeof body.money === 'object' ? body.money : {}) as Record<string, unknown>;
  const money: MoneyInput = {};
  for (const f of MONEY_FIELDS) {
    const v = rawMoney[f.key];
    if (v === undefined || v === null) continue;
    if (typeof v !== 'string' && typeof v !== 'number') return NextResponse.json({ error: `${f.label} must be a number` }, { status: 400 });
    money[f.key] = v;
  }

  try {
    const result = await startTourFromTemplates(supabase as unknown as SupabaseClient, {
      tourId,
      workspaceId: auth.workspaceId,
      input: { budgetTemplateId, money, advanceShow: advanceShow as AdvanceStarterKey | null, advanceDaysOff: body.advanceDaysOff === true },
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof StartFromInputError) return NextResponse.json({ error: e.message }, { status: 400 });
    if (e instanceof TemplateNotFound) return NextResponse.json({ error: 'Budget template not found' }, { status: 404 });
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not set up the tour' }, { status: 500 });
  }
}

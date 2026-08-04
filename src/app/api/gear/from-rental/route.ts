/**
 * UX21 — Promote a rental_inventory row to a canonical Gear in one call.
 *
 * Creates a public.gear row populated from rental_inventory, sets
 * gear.rental_inventory_id, and (if tour_id supplied) inserts a public.
 * tour_gear join so the picker flow ("Add to tour" or in-grid promotion)
 * completes in one round-trip.
 *
 * Default ownership when promoting from the rental house is `owned`.
 */

import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();
  if (!profile?.workspace_id) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  let body: {
    rental_inventory_id?: string;
    tour_id?: string | null;
    ownership?: 'owned' | 'sub_hired' | 'hired_to_client';
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const rentalInventoryId = String(body.rental_inventory_id ?? '').trim();
  if (!rentalInventoryId) {
    return NextResponse.json({ error: 'rental_inventory_id is required' }, { status: 400 });
  }
  const ownership = body.ownership ?? 'owned';
  const tourId = body.tour_id ?? null;

  // Load the rental_inventory row.
  const { data: rental, error: rentalErr } = await supabase
    .from('rental_inventory')
    .select('id, name, category, serial_number, day_rate, image_url, notes')
    .eq('id', rentalInventoryId)
    .maybeSingle();
  if (rentalErr) {
    return NextResponse.json({ error: rentalErr.message }, { status: 500 });
  }
  if (!rental) {
    return NextResponse.json({ error: 'rental_inventory row not found' }, { status: 404 });
  }

  // If a Gear is already linked to this rental_inventory row in this workspace,
  // reuse it instead of creating a duplicate.
  const { data: existing } = await supabase
    .from('gear')
    .select('id')
    .eq('workspace_id', profile.workspace_id)
    .eq('rental_inventory_id', rentalInventoryId)
    .maybeSingle();

  let gearId: string;
  if (existing?.id) {
    gearId = existing.id as string;
  } else {
    const { data: created, error: createErr } = await supabase
      .from('gear')
      .insert({
        workspace_id: profile.workspace_id,
        name: rental.name,
        category: rental.category,
        serial_number: rental.serial_number,
        ownership,
        hire_cost_amount: rental.day_rate,
        hire_cost_currency: 'GBP',
        hire_cost_period: 'day',
        notes: rental.notes,
        image_url: rental.image_url,
        rental_inventory_id: rentalInventoryId,
      })
      .select('id')
      .single();
    if (createErr) {
      return NextResponse.json({ error: createErr.message }, { status: 500 });
    }
    gearId = created.id as string;
  }

  // Optional: attach to a tour via tour_gear (idempotent — onConflict ignores duplicates).
  if (tourId) {
    await supabase.from('tour_gear').upsert(
      {
        workspace_id: profile.workspace_id,
        tour_id: tourId,
        gear_id: gearId,
        tour_ownership: ownership,
        tour_hire_cost_amount: rental.day_rate,
        tour_hire_cost_currency: 'GBP',
        tour_hire_cost_period: 'day',
        quantity: 1,
      },
      { onConflict: 'tour_id,gear_id' },
    );
  }

  // Return the Gear row (with tour_gear) shaped like /api/gear/[id].
  const { data, error } = await supabase
    .from('gear')
    .select(
      `
      *,
      tour_gear(*)
    `,
    )
    .eq('id', gearId)
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

/* ============================================
   LOWPASS — Bulk personnel import (CSV pipeline)

   POST { people: ImportPerson[] } — workspace scoped, sequential LP-IDs.
   ============================================ */

import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import type { PersonnelImportPerson } from '@/lib/personnel-import';

const DEFAULT_STANDARD_RATES = {
  show_day_rate: 0,
  off_day_rate: 0,
  travel_day_rate: 0,
  per_diem_rate: 0,
  currency: 'GBP',
};

function allocateLpIds(existingLpIds: string[], count: number): string[] {
  let max = 0;
  for (const lp of existingLpIds) {
    const m = /^LP-(\d+)$/i.exec(lp);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return Array.from({ length: count }, (_, i) => `LP-${String(max + 1 + i).padStart(5, '0')}`);
}

function buildRow(raw: PersonnelImportPerson, lp_id: string, workspace_id: string) {
  let name = raw.name?.trim() ?? '';
  if (!name && (raw.first_name || raw.middle_names || raw.surname || raw.last_name)) {
    name = [raw.first_name, raw.middle_names, raw.surname ?? raw.last_name]
      .filter(Boolean)
      .map((s) => String(s).trim())
      .join(' ')
      .trim();
  }
  const p = { ...raw, name };

  const standard_rates = {
    ...DEFAULT_STANDARD_RATES,
    show_day_rate: Number(p.show_day_rate) || 0,
    off_day_rate: Number(p.off_day_rate) || 0,
    travel_day_rate: Number(p.travel_day_rate) || 0,
    per_diem_rate: Number(p.per_diem_rate) || 0,
    currency: p.currency && String(p.currency).trim() ? String(p.currency).trim().toUpperCase() : 'GBP',
  };

  const passport0: Record<string, string> = {};
  if (p.passport_number) passport0.number = String(p.passport_number);
  if (p.passport_type) passport0.type = String(p.passport_type);
  if (p.passport_code) passport0.code = String(p.passport_code);
  if (p.passport_authority) passport0.authority = String(p.passport_authority);
  if (p.date_of_birth) passport0.date_of_birth = String(p.date_of_birth);
  if (p.passport_place_of_birth) passport0.place_of_birth = String(p.passport_place_of_birth);
  if (p.passport_valid_from) passport0.valid_from = String(p.passport_valid_from);
  if (p.passport_expiry) passport0.expiry_date = String(p.passport_expiry);
  if (p.passport_empty_pages) passport0.empty_pages = String(p.passport_empty_pages);
  if (p.passport_empty_dbl_pages) passport0.empty_double_pages = String(p.passport_empty_dbl_pages);
  if (p.passport_citizenship) passport0.citizenship = String(p.passport_citizenship);

  const passport1: Record<string, string> = {};
  if (p.passport2_number) passport1.number = String(p.passport2_number);
  if (p.passport2_expiry) passport1.expiry_date = String(p.passport2_expiry);
  if (p.passport2_citizenship) passport1.citizenship = String(p.passport2_citizenship);

  const passport_info: Record<string, string> = {};
  if (p.passport_number) passport_info.number = String(p.passport_number);
  if (p.passport_country) passport_info.country = String(p.passport_country);
  if (p.passport_expiry) passport_info.expiry_date = String(p.passport_expiry);
  if (p.passport_full_name) passport_info.full_name = String(p.passport_full_name);
  if (!passport_info.country && p.passport_citizenship) passport_info.country = String(p.passport_citizenship);
  if (!passport_info.country && p.passport_code) passport_info.country = String(p.passport_code);

  const extended_profile: Record<string, unknown> = {};
  if (Object.keys(passport0).length || Object.keys(passport1).length) {
    extended_profile.passports = [passport0, passport1];
  }

  const np: Record<string, string> = {};
  if (p.first_name) np.first_name = String(p.first_name);
  if (p.middle_names) np.middle_names = String(p.middle_names);
  if (p.surname) np.surname = String(p.surname);
  else if (p.last_name) np.surname = String(p.last_name);
  if (p.nickname) np.nickname = String(p.nickname);
  if (Object.keys(np).length) extended_profile.name_parts = np;

  if (p.legal_name) extended_profile.legal_name = p.legal_name;
  if (p.pronouns) extended_profile.pronouns = p.pronouns;
  if (p.nationality) extended_profile.nationality = p.nationality;
  if (p.date_of_birth) extended_profile.date_of_birth = p.date_of_birth;
  if (p.marital_status) extended_profile.marital_status = p.marital_status;
  if (p.sex) extended_profile.sex = p.sex;
  if (p.partner_name) extended_profile.partner_name = p.partner_name;
  if (p.medical_notes) extended_profile.medical_notes = p.medical_notes;
  if (p.instruments) extended_profile.instruments = p.instruments;
  if (p.internal_notes) extended_profile.internal_notes = p.internal_notes;
  if (p.travel_notes) extended_profile.travel_notes = p.travel_notes;

  const us: Record<string, string> = {};
  if (p.ssn) us.social_security_number = String(p.ssn);
  if (p.green_card) us.green_card_number = String(p.green_card);
  if (Object.keys(us).length) extended_profile.us_only = us;

  const tx: Record<string, string> = {};
  if (p.tsa_precheck) tx.tsa_precheck = String(p.tsa_precheck);
  if (p.aisle_window) tx.aisle_window = String(p.aisle_window);
  if (p.ff1) tx.frequent_flyer_1 = String(p.ff1);
  if (p.ff2) tx.frequent_flyer_2 = String(p.ff2);
  if (p.ff3) tx.frequent_flyer_3 = String(p.ff3);
  if (p.ff4) tx.frequent_flyer_4 = String(p.ff4);
  if (Object.keys(tx).length) extended_profile.transport_extra = tx;

  const hl: Record<string, string> = {};
  if (p.allergies_medicine) hl.allergies_medicine = String(p.allergies_medicine);
  if (p.medical_conditions) hl.medical_conditions = String(p.medical_conditions);
  if (p.criminal_convictions) hl.criminal_convictions = String(p.criminal_convictions);
  if (p.insurance_crew) hl.insurance_info_crew = String(p.insurance_crew);
  if (Object.keys(hl).length) extended_profile.health = hl;

  const mx: Record<string, string> = {};
  if (p.coffee_order) mx.coffee_order = String(p.coffee_order);
  if (p.pizza_order) mx.pizza_order = String(p.pizza_order);
  if (Object.keys(mx).length) extended_profile.merch_extras = mx;

  const addr: Record<string, string> = {};
  if (p.address_line1) addr.line1 = p.address_line1;
  if (p.address_line2) addr.line2 = p.address_line2;
  if (p.address_city) addr.city = p.address_city;
  if (p.address_region) addr.region = p.address_region;
  if (p.address_postcode) addr.postcode = p.address_postcode;
  if (p.address_country) addr.country = p.address_country;
  if (Object.keys(addr).length) extended_profile.address = addr;

  const em: Record<string, string> = {};
  if (p.emergency_name) em.name = p.emergency_name;
  if (p.emergency_relationship) em.relationship = p.emergency_relationship;
  if (p.emergency_phone) em.phone = p.emergency_phone;
  if (p.emergency_email) em.email = p.emergency_email;
  if (Object.keys(em).length) extended_profile.emergency_contact = em;

  return {
    workspace_id,
    lp_id,
    name: name.trim(),
    role: p.role?.trim() ?? '',
    email: p.email?.trim() || null,
    phone: p.phone?.trim() || null,
    home_airport: p.home_airport?.trim() || null,
    dietary_needs: p.dietary_needs?.trim() || null,
    merch_size: p.merch_size?.trim() || null,
    preferences: p.preferences?.trim() || null,
    standard_rates,
    passport_info,
    extended_profile,
  };
}

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

  if (!profile?.workspace_id) {
    return NextResponse.json({ error: 'No workspace' }, { status: 403 });
  }

  let body: { people?: PersonnelImportPerson[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const raw = body.people;
  if (!Array.isArray(raw) || raw.length === 0) {
    return NextResponse.json({ error: 'people[] is required' }, { status: 400 });
  }

  const people = raw.filter((row) => {
    if (!row || typeof row !== 'object') return false;
    const r = row as PersonnelImportPerson;
    const n =
      r.name?.trim() ??
      [r.first_name, r.middle_names, r.surname ?? r.last_name]
        .filter(Boolean)
        .map((s) => String(s).trim())
        .filter(Boolean)
        .join(' ')
        .trim();
    return !!n;
  }) as PersonnelImportPerson[];
  if (people.length === 0) {
    return NextResponse.json({ error: 'Each row needs a name' }, { status: 400 });
  }

  const { data: existing, error: exErr } = await supabase
    .from('personnel')
    .select('lp_id')
    .eq('workspace_id', profile.workspace_id);

  if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });

  const lpIds = allocateLpIds(
    (existing ?? []).map((r: { lp_id: string }) => r.lp_id),
    people.length
  );

  const rows = people.map((p, i) => buildRow(p, lpIds[i]!, profile.workspace_id));

  let { data: inserted, error } = await supabase.from('personnel').insert(rows).select();

  if (error?.message?.includes('extended_profile') || error?.message?.includes('schema cache')) {
    const stripped = rows.map((row) => {
      const { extended_profile: _x, ...rest } = row as { extended_profile?: unknown };
      return rest;
    });
    const r2 = await supabase.from('personnel').insert(stripped).select();
    inserted = r2.data;
    error = r2.error;
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Sprint 9 §13.A.13 — same fix as POST /api/personnel: keep
  // the personnel.id == persons.id convention so entityRouting
  // doesn't surface "Person not found" on click. Best-effort
  // bulk upsert; failures don't block the import.
  const insertedRows = (inserted ?? []) as Array<{
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
  }>;
  if (insertedRows.length > 0) {
    const personRows = insertedRows.map((r) => ({
      id: r.id,
      workspace_id: profile.workspace_id,
      full_name: r.name,
      email: r.email,
      phone: r.phone,
    }));
    const { error: personsErr } = await supabase
      .from('persons')
      .upsert(personRows, { onConflict: 'id', ignoreDuplicates: false });
    if (personsErr) {
      console.error('[personnel import] persons sibling upsert failed:', personsErr);
    }
  }

  return NextResponse.json({ created: inserted?.length ?? 0, personnel: inserted ?? [] });
}

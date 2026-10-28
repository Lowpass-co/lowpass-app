/* ============================================
   Advance templates — workspace-wide (Oct 2026 rebuild)

   One store: advance_layout_templates. The old per-tour templates
   (advance_form_configs.is_template) were copied in by migration 276.
   advance_day_type_templates says which template each day type gets.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdvSection } from '@/lib/advance/board';
import { ADVANCE_DAY_TYPES_DEFAULT, dayTypes } from '@/lib/advance/board';

export interface AdvTemplate {
  id: string;
  name: string;
  sections: AdvSection[];
  updated_at: string | null;
}

export interface TemplateSet {
  templates: AdvTemplate[];
  /** day type → template id */
  mapping: Record<string, string>;
}

export async function loadTemplateSet(client: SupabaseClient, workspaceId: string): Promise<TemplateSet> {
  const [{ data: rows, error }, { data: map, error: mErr }] = await Promise.all([
    client
      .from('advance_layout_templates')
      .select('id, name, sections, updated_at')
      .eq('workspace_id', workspaceId)
      .order('name', { ascending: true }),
    client.from('advance_day_type_templates').select('day_type, layout_template_id').eq('workspace_id', workspaceId),
  ]);
  if (error) throw new Error(`advance templates: ${error.message}`);
  if (mErr) throw new Error(`advance day-type templates: ${mErr.message}`);
  const templates = ((rows ?? []) as AdvTemplate[]).map((t) => ({
    ...t,
    sections: Array.isArray(t.sections) ? t.sections : [],
  }));
  const ids = new Set(templates.map((t) => t.id));
  const mapping: Record<string, string> = {};
  for (const m of (map ?? []) as { day_type: string; layout_template_id: string }[]) {
    if (ids.has(m.layout_template_id)) mapping[m.day_type] = m.layout_template_id;
  }
  return { templates, mapping };
}

/**
 * The template a day gets: the first of its day types that has one mapped.
 * Show / festival days fall back to a template literally called "Show day"
 * so a workspace that hasn't set anything up still gets a sensible start.
 */
export function templateForDay(set: TemplateSet, dayType: string | null | undefined): AdvTemplate | null {
  const types = dayTypes(dayType);
  for (const t of types) {
    const id = set.mapping[t];
    if (id) return set.templates.find((x) => x.id === id) ?? null;
  }
  if (types.some((t) => ADVANCE_DAY_TYPES_DEFAULT.includes(t)) || types.length === 0) {
    return set.templates.find((t) => t.name.trim().toLowerCase() === 'show day') ?? null;
  }
  return null;
}

/**
 * Push a template's current layout to the days that follow it: days made
 * from it, not customised by hand, and not yet sent to a venue (a venue that
 * has a link keeps the questions it was asked). Returns how many days moved.
 */
export async function applyTemplateToDays(
  client: SupabaseClient,
  templateId: string,
  opts: { except?: string } = {},
): Promise<{ updated: number; kept: number }> {
  const { data: tpl, error } = await client
    .from('advance_layout_templates')
    .select('id, sections')
    .eq('id', templateId)
    .maybeSingle<{ id: string; sections: AdvSection[] | null }>();
  if (error || !tpl) throw new Error(`template: ${error?.message ?? 'not found'}`);
  const { data: cfgs, error: cErr } = await client
    .from('advance_form_configs')
    .select('id, routing_id, customised')
    .eq('layout_template_id', templateId);
  if (cErr) throw new Error(cErr.message);
  const rows = ((cfgs ?? []) as { id: string; routing_id: string | null; customised: boolean }[]).filter(
    (c) => c.routing_id && c.id !== opts.except,
  );
  const routingIds = rows.map((r) => r.routing_id as string);
  const sent = new Set<string>();
  if (routingIds.length) {
    const { data: links } = await client
      .from('advance_intake_links')
      .select('routing_id, status, revoked_at')
      .in('routing_id', routingIds);
    for (const l of (links ?? []) as { routing_id: string; status: string; revoked_at: string | null }[]) {
      if (l.status !== 'revoked' && !l.revoked_at) sent.add(l.routing_id);
    }
  }
  const targets = rows.filter((r) => !r.customised && !sent.has(r.routing_id as string));
  const sections = (Array.isArray(tpl.sections) ? tpl.sections : []).map((s, i) => ({ ...s, order: i }));
  if (targets.length) {
    const { error: uErr } = await client
      .from('advance_form_configs')
      .update({ sections, updated_at: new Date().toISOString() })
      .in('id', targets.map((t) => t.id));
    if (uErr) throw new Error(uErr.message);
  }
  return { updated: targets.length, kept: rows.length - targets.length };
}

/** Does this day get an advance at all? Shows/festivals always; others only when mapped. */
export function dayHasAdvance(set: TemplateSet, dayType: string | null | undefined, hasInstance: boolean): boolean {
  if (hasInstance) return true;
  const types = dayTypes(dayType);
  if (types.some((t) => ADVANCE_DAY_TYPES_DEFAULT.includes(t))) return true;
  return types.some((t) => !!set.mapping[t]);
}

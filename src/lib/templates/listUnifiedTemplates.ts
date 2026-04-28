import type { SupabaseClient } from '@supabase/supabase-js';
import type { TemplateKind, TemplateVm } from '@/lib/types/template-vm';

async function riderPackExportsByPack(supabase: SupabaseClient) {
  const { data } = await supabase
    .from('rider_pack_exports')
    .select('pack_id, exported_at');

  const countByPack = new Map<string, number>();
  const lastByPack = new Map<string, string>();
  for (const row of data ?? []) {
    const pid = row.pack_id as string;
    countByPack.set(pid, (countByPack.get(pid) ?? 0) + 1);
    const exp = row.exported_at as string | null;
    if (exp && (!lastByPack.has(pid) || exp > (lastByPack.get(pid) as string))) {
      lastByPack.set(pid, exp);
    }
  }
  return { countByPack, lastByPack };
}

/** Workspace-scoped merged list for UX13b Templates hub. Read-only aggregates. */
export async function listUnifiedTemplates(
  supabase: SupabaseClient,
  filters?: {
    kind?: TemplateKind | '';
    updatedAfter?: string | null;
    updatedBefore?: string | null;
    q?: string;
  },
): Promise<TemplateVm[]> {
  const { countByPack, lastByPack } = await riderPackExportsByPack(supabase);

  const [
    { data: layouts },
    { data: schedules },
    { data: advances },
    { data: riderPacks },
  ] = await Promise.all([
    supabase.from('advance_layout_templates').select('id, name, sections, created_at').order('created_at', { ascending: false }),
    supabase.from('advance_schedule_templates').select('id, name, tour_id, created_at').order('created_at', { ascending: false }),
    supabase.from('advance_templates').select('id, name, description, workspace_id, created_at').order('created_at', { ascending: false }),
    supabase.from('rider_packs').select('id, title, updated_at, created_by').order('updated_at', { ascending: false }),
  ]);

  const out: TemplateVm[] = [];

  for (const layout of layouts ?? []) {
    const secs = layout.sections as unknown;
    let desc: string | null = null;
    if (Array.isArray(secs)) {
      desc = `${secs.length} section(s)`;
    }
    const createdAt = String(layout.created_at);
    out.push({
      id: String(layout.id),
      kind: 'advance-layout',
      name: String(layout.name ?? ''),
      description: desc,
      usedCount: 0,
      lastUsedAt: null,
      updatedAt: createdAt,
      createdBy: null,
      editorHref: '/advance',
    });
  }

  for (const s of schedules ?? []) {
    const createdAt = String(s.created_at);
    const tourId = (s.tour_id as string | null) ?? null;
    const tourHref = tourId ? `/tours/${tourId}/advance` : '/advance';
    out.push({
      id: String(s.id),
      kind: 'advance-schedule',
      name: String(s.name ?? ''),
      description: tourId ? 'Tour-scoped schedule template' : 'Workspace-wide schedule template',
      usedCount: 0,
      lastUsedAt: null,
      updatedAt: createdAt,
      createdBy: null,
      editorHref: tourHref,
    });
  }

  for (const t of advances ?? []) {
    const createdAt = String((t as { created_at: string }).created_at);
    out.push({
      id: String(t.id),
      kind: 'other',
      name: String(t.name ?? ''),
      description: (t.description as string | null) ?? null,
      usedCount: 0,
      lastUsedAt: null,
      updatedAt: createdAt,
      createdBy: null,
      editorHref: '/advance',
    });
  }

  for (const pack of riderPacks ?? []) {
    const pid = String(pack.id);
    const name = ((pack.title as string | null) ?? 'Rider pack').trim();
    const updatedAt = String(pack.updated_at ?? new Date().toISOString());
    const used = countByPack.get(pid) ?? 0;
    const last = lastByPack.get(pid) ?? null;
    out.push({
      id: pid,
      kind: 'rider-pack',
      name,
      description: 'Rider / technical pack',
      usedCount: used,
      lastUsedAt: last,
      updatedAt,
      createdBy: (pack.created_by as string | null) ?? null,
      editorHref: `/rider-packs/${pid}`,
    });
  }

  let rows = out;

  if (filters?.kind) {
    rows = rows.filter((r) => r.kind === filters.kind);
  }
  if (filters?.q?.trim()) {
    const q = filters.q.trim().toLowerCase();
    rows = rows.filter(
      (r) => r.name.toLowerCase().includes(q) || (r.description?.toLowerCase().includes(q) ?? false),
    );
  }
  if (filters?.updatedAfter?.trim()) {
    const ms = Date.parse(filters.updatedAfter);
    if (!Number.isNaN(ms)) rows = rows.filter((r) => new Date(r.updatedAt).getTime() >= ms);
  }
  if (filters?.updatedBefore?.trim()) {
    const ms = Date.parse(filters.updatedBefore);
    if (!Number.isNaN(ms)) rows = rows.filter((r) => new Date(r.updatedAt).getTime() <= ms + 86400000);
  }

  rows.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return rows;
}

/** Single-record fetch for slide-over lookup (prefer over loading the full merged list). */
export async function getUnifiedTemplate(
  supabase: SupabaseClient,
  kind: TemplateKind,
  id: string,
): Promise<TemplateVm | null> {
  const { countByPack, lastByPack } = await riderPackExportsByPack(supabase);

  switch (kind) {
    case 'budget':
      return null;
    case 'advance-layout': {
      const { data } = await supabase
        .from('advance_layout_templates')
        .select('id, name, sections, created_at')
        .eq('id', id)
        .maybeSingle();
      if (!data) return null;
      const secs = data.sections as unknown;
      const desc = Array.isArray(secs) ? `${secs.length} section(s)` : null;
      return {
        id,
        kind: 'advance-layout',
        name: String(data.name ?? ''),
        description: desc,
        usedCount: 0,
        lastUsedAt: null,
        updatedAt: String(data.created_at),
        createdBy: null,
        editorHref: '/advance',
      };
    }
    case 'advance-schedule': {
      const { data } = await supabase
        .from('advance_schedule_templates')
        .select('id, name, tour_id, created_at')
        .eq('id', id)
        .maybeSingle();
      if (!data) return null;
      const tourId = (data.tour_id as string | null) ?? null;
      return {
        id,
        kind: 'advance-schedule',
        name: String(data.name ?? ''),
        description: tourId ? 'Tour-scoped schedule template' : 'Workspace-wide schedule template',
        usedCount: 0,
        lastUsedAt: null,
        updatedAt: String(data.created_at),
        createdBy: null,
        editorHref: tourId ? `/tours/${tourId}/advance` : '/advance',
      };
    }
    case 'other': {
      const { data } = await supabase
        .from('advance_templates')
        .select('id, name, description, created_at')
        .eq('id', id)
        .maybeSingle();
      if (!data) return null;
      return {
        id,
        kind: 'other',
        name: String(data.name ?? ''),
        description: (data.description as string | null) ?? null,
        usedCount: 0,
        lastUsedAt: null,
        updatedAt: String(data.created_at),
        createdBy: null,
        editorHref: '/advance',
      };
    }
    case 'rider-pack': {
      const { data } = await supabase
        .from('rider_packs')
        .select('id, title, updated_at, created_by')
        .eq('id', id)
        .maybeSingle();
      if (!data) return null;
      const used = countByPack.get(id) ?? 0;
      const last = lastByPack.get(id) ?? null;
      return {
        id,
        kind: 'rider-pack',
        name: ((data.title as string | null) ?? 'Rider pack').trim(),
        description: 'Rider / technical pack',
        usedCount: used,
        lastUsedAt: last,
        updatedAt: String(data.updated_at ?? new Date().toISOString()),
        createdBy: (data.created_by as string | null) ?? null,
        editorHref: `/rider-packs/${id}`,
      };
    }
    default:
      return null;
  }
}


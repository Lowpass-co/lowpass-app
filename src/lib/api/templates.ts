import type { TemplateKind, TemplateVm } from '@/lib/types/template-vm';

async function parseJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export async function listTemplates(filters?: {
  kind?: TemplateKind | '';
  q?: string;
  updatedAfter?: string | null;
  updatedBefore?: string | null;
}): Promise<TemplateVm[]> {
  const qs = new URLSearchParams();
  if (filters?.kind) qs.set('kind', filters.kind);
  if (filters?.q?.trim()) qs.set('q', filters.q.trim());
  if (filters?.updatedAfter?.trim()) qs.set('updated_after', filters.updatedAfter.trim());
  if (filters?.updatedBefore?.trim()) qs.set('updated_before', filters.updatedBefore.trim());
  const res = await fetch(`/api/templates?${qs}`, { cache: 'no-store' });
  const json = await parseJson(res);
  if (!res.ok) throw new Error((json as { error?: string }).error ?? 'Failed to list templates');
  return (json as { templates?: TemplateVm[] }).templates ?? [];
}

export async function getTemplateById(kind: TemplateKind, id: string): Promise<TemplateVm | null> {
  const res = await fetch(`/api/templates/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`, {
    cache: 'no-store',
  });
  if (res.status === 404) return null;
  const json = await parseJson(res);
  if (!res.ok) throw new Error((json as { error?: string }).error ?? 'Failed to load template');
  return (json as { template?: TemplateVm }).template ?? null;
}

export async function searchTemplates(query: string, opts?: { limit?: number }): Promise<TemplateVm[]> {
  const rows = await listTemplates({ kind: '', q: query });
  return rows.slice(0, opts?.limit ?? 20);
}

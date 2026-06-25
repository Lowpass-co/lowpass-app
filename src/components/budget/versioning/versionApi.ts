/* Client helpers for the budget-version transitions (B2). The server enforces
   the approver gate + atomicity; these are thin fetch wrappers. */

export type VersionStatus = 'draft' | 'approved' | 'superseded';

export interface BudgetVersionVm {
  id: string;
  version_number: number;
  status: VersionStatus;
}

async function post(path: string, body?: unknown): Promise<Response> {
  return fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

export const approveVersion = (id: string, note?: string) =>
  post(`/api/budget/versions/${id}/approve`, note ? { note } : undefined);
export const unlockVersion = (id: string) => post(`/api/budget/versions/${id}/unlock`);
export const amendVersion = (id: string) => post(`/api/budget/versions/${id}/amend`);

/** Status → token colour for the pill / dot. Orange = approved/Current,
 *  muted = draft, grey = superseded. Token-clean. */
export function versionStatusColor(status: VersionStatus): { bg: string; fg: string } {
  if (status === 'approved') return { bg: 'var(--lp-orange)', fg: 'var(--lp-text-inverse)' };
  if (status === 'draft') return { bg: 'var(--lp-panel)', fg: 'var(--lp-text-secondary)' };
  return { bg: 'var(--lp-surface-muted, var(--lp-panel))', fg: 'var(--lp-text-tertiary)' };
}

export function versionLabel(v: BudgetVersionVm): string {
  return `v${v.version_number} · ${v.status}`;
}

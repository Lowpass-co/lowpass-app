'use client';

/* ============================================================
   LOWPASS — <TourRolesPanel> (D1-4)

   TM/admin surface to assign tour roles + mint per-person tokenized Day links.
   Assign a roster person a role (tm/production/accountant/crew/driver/band/
   management), then generate a /m/day/[token] link they open on their phone —
   role-scoped server-side (crew never receives money/notes). Revoke kills it.

   Admin/manager only (the page gates visibility; the API re-checks).
   ============================================================ */

import { useCallback, useEffect, useState } from 'react';
import { ALL_ROLES, ROLE_LABELS, type TourRole } from '@/lib/roles/slices';
import { StyledSelect } from '@/components/ui/StyledSelect';

interface RoleRow { id: string; person_id: string; role: TourRole; person_name: string | null }
interface Candidate { personId: string; name: string }
interface LinkRow { id: string; roleId: string; token: string; status: string; role: string | null; personName: string | null; lastViewedAt: string | null }

export function TourRolesPanel({ tourId }: { tourId: string }) {
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [personId, setPersonId] = useState('');
  const [role, setRole] = useState<TourRole>('crew');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [r, l] = await Promise.all([
      fetch(`/api/tours/${tourId}/roles`).then((x) => x.json()).catch(() => ({})),
      fetch(`/api/tours/${tourId}/role-links`).then((x) => x.json()).catch(() => ({})),
    ]);
    setRoles(r.roles ?? []);
    setCandidates(r.candidates ?? []);
    setLinks(l.links ?? []);
  }, [tourId]);

  useEffect(() => { void load(); }, [load]);

  async function assign() {
    if (!personId) { setError('Pick a person.'); return; }
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/tours/${tourId}/roles`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personId, role }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error ?? 'Assign failed'); return; }
      setPersonId('');
      await load();
    } finally { setBusy(false); }
  }

  async function removeRole(id: string) {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/tours/${tourId}/roles`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roleId: id }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error ?? 'Remove failed'); return; }
      await load();
    } finally { setBusy(false); }
  }

  async function mintLink(roleId: string) {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/tours/${tourId}/role-links`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roleId }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error ?? 'Mint failed'); return; }
      await load();
    } finally { setBusy(false); }
  }

  async function revokeLink(linkId: string) {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/tours/${tourId}/role-links`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ linkId }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error ?? 'Revoke failed'); return; }
      await load();
    } finally { setBusy(false); }
  }

  function copy(token: string) {
    const url = `${window.location.origin}/m/day/${token}`;
    void navigator.clipboard?.writeText(url);
    setCopied(token);
    setTimeout(() => setCopied((c) => (c === token ? null : c)), 1500);
  }

  const activeLinkFor = (roleId: string) => links.find((l) => l.roleId === roleId && l.status === 'pending') ?? null;

  return (
    <section style={{ border: '1px solid var(--lp-border)', borderRadius: 'var(--lp-radius-lg)', background: 'var(--lp-panel)', padding: 'var(--lp-space-4)', marginBottom: 'var(--lp-space-4)' }}>
      <h2 className="lp-label-caps" style={{ margin: '0 0 12px', fontSize: 11, color: 'var(--lp-text-tertiary)', letterSpacing: 'var(--lp-tracking-caps)' }}>Roles & day links</h2>

      {/* Assign — Assign stays disabled until a person is chosen (ROLE-04: an
          empty selection must be inert, never crash). */}
      <div className="flex flex-wrap items-center" style={{ gap: 8, marginBottom: 12 }}>
        <div data-testid="role-person" style={{ minWidth: 180 }}>
          <StyledSelect
            value={personId}
            onChange={setPersonId}
            options={candidates.map((c) => ({ value: c.personId, label: c.name }))}
            placeholder="Choose person…"
            size="sm"
          />
        </div>
        <div data-testid="role-role" style={{ minWidth: 150 }}>
          <StyledSelect<TourRole>
            value={role}
            onChange={setRole}
            options={ALL_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
            size="sm"
          />
        </div>
        <button type="button" onClick={() => void assign()} disabled={busy || !personId} data-testid="role-assign" className="btn-transition" style={{ ...btnPrimary, opacity: busy || !personId ? 0.5 : 1, cursor: busy || !personId ? 'not-allowed' : 'pointer' }}>Assign</button>
      </div>

      {error ? <div role="alert" style={{ fontSize: 'var(--lp-text-xs)', color: 'var(--color-lp-error)', marginBottom: 8 }}>{error}</div> : null}

      {/* Existing roles + links */}
      {roles.length === 0 ? (
        <p style={{ margin: 0, fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-tertiary)' }}>No roles assigned yet.</p>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
          {roles.map((r) => {
            const link = activeLinkFor(r.id);
            return (
              <li key={r.id} className="flex flex-wrap items-center" style={{ gap: 8, justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--lp-border-subtle)' }}>
                <span style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text)' }}>
                  {r.person_name ?? 'Unknown'} <span className="lp-label-caps" style={{ fontSize: 9, color: 'var(--lp-text-tertiary)', marginLeft: 6 }}>{ROLE_LABELS[r.role]}</span>
                </span>
                <span className="flex items-center" style={{ gap: 6 }}>
                  {link ? (
                    <>
                      <button type="button" onClick={() => copy(link.token)} className="btn-transition" style={btnGhost} data-testid="role-copy-link">{copied === link.token ? 'Copied!' : 'Copy link'}</button>
                      <button type="button" onClick={() => void revokeLink(link.id)} disabled={busy} className="btn-transition" style={btnGhostDanger} data-testid="role-revoke-link">Revoke</button>
                    </>
                  ) : (
                    <button type="button" onClick={() => void mintLink(r.id)} disabled={busy} className="btn-transition" style={btnGhost} data-testid="role-mint-link">Generate link</button>
                  )}
                  <button type="button" onClick={() => void removeRole(r.id)} disabled={busy} className="btn-transition" style={btnGhostDanger} title="Remove role">×</button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const btnPrimary: React.CSSProperties = { padding: '5px 12px', fontSize: 'var(--lp-text-sm)', fontWeight: 'var(--lp-weight-semibold)', color: 'var(--lp-text-inverse)', background: 'var(--color-lp-orange)', border: 0, borderRadius: 'var(--lp-radius-md)', cursor: 'pointer' };
const btnGhost: React.CSSProperties = { padding: '4px 10px', fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-secondary)', background: 'transparent', border: '1px solid var(--lp-border-strong)', borderRadius: 'var(--lp-radius-md)', cursor: 'pointer' };
const btnGhostDanger: React.CSSProperties = { ...btnGhost, color: 'var(--color-lp-error)' };

'use client';

/* ============================================
   LOWPASS — AI limits editor (§AI-5, client)

   Two cards: the workspace budget + default per-user caps (PATCH
   /api/ai-usage/limits), and a per-member override table (PUT /
   DELETE /api/ai-usage/overrides). All amounts are entered in USD
   and stored as micro-USD (1e6 = $1). The server enforces admin via
   RLS; this UI is only rendered for admins by the page.
   ============================================ */

import { useState } from 'react';
import { Pencil, Trash2, Check, X } from 'lucide-react';
import { formatUsd } from '@/lib/ai/usage-types';

export interface AiLimitMember {
  userId: string;
  label: string;
  role: string;
  softOverrideMicros: number | null;
  hardOverrideMicros: number | null;
}

const microsToUsd = (m: number): string => (m / 1_000_000).toString();
const usdToMicros = (s: string): number | null => {
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 1_000_000);
};

const inputStyle: React.CSSProperties = {
  width: 110,
  padding: '6px 9px',
  fontSize: 13,
  background: 'var(--lp-bg-deep)',
  color: 'var(--lp-text)',
  border: '1px solid var(--lp-border-strong)',
  borderRadius: 6,
  outline: 'none',
};

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function AiLimitsClient({
  initialLimits,
  members: initialMembers,
}: {
  initialLimits: { monthlyUsdMicros: number; softUsdMicros: number; hardUsdMicros: number };
  members: AiLimitMember[];
}) {
  const [monthly, setMonthly] = useState(microsToUsd(initialLimits.monthlyUsdMicros));
  const [soft, setSoft] = useState(microsToUsd(initialLimits.softUsdMicros));
  const [hard, setHard] = useState(microsToUsd(initialLimits.hardUsdMicros));
  // Saved workspace caps drive the "effective default" column below.
  const [savedSoft, setSavedSoft] = useState(initialLimits.softUsdMicros);
  const [savedHard, setSavedHard] = useState(initialLimits.hardUsdMicros);

  const [save, setSave] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);

  const [members, setMembers] = useState(initialMembers);

  const saveLimits = async () => {
    const m = usdToMicros(monthly);
    const s = usdToMicros(soft);
    const h = usdToMicros(hard);
    if (m === null || s === null || h === null) {
      setError('All amounts must be numbers ≥ 0.');
      setSave('error');
      return;
    }
    if (h < s) {
      setError('Hard cap must be ≥ soft cap.');
      setSave('error');
      return;
    }
    setSave('saving');
    setError(null);
    try {
      const res = await fetch('/api/ai-usage/limits', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          monthlyBudgetUsdMicros: m,
          perUserSoftCapUsdMicros: s,
          perUserHardCapUsdMicros: h,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? 'Save failed');
      }
      setSavedSoft(s);
      setSavedHard(h);
      setSave('saved');
      window.setTimeout(() => setSave((v) => (v === 'saved' ? 'idle' : v)), 1800);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
      setSave('error');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Workspace budget + default caps */}
      <Card title="Workspace budget & default caps">
        <div className="flex flex-col gap-3">
          <Field label="Monthly budget (USD)">
            <UsdInput value={monthly} onChange={setMonthly} />
          </Field>
          <Field label="Default per-user soft cap (USD) — warns the user">
            <UsdInput value={soft} onChange={setSoft} />
          </Field>
          <Field label="Default per-user hard cap (USD) — blocks calls">
            <UsdInput value={hard} onChange={setHard} />
          </Field>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={saveLimits}
            disabled={save === 'saving'}
            className="btn-transition rounded-lg px-4 py-2 disabled:opacity-60"
            style={{
              background: 'var(--color-lp-orange)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {save === 'saving' ? 'Saving…' : 'Save limits'}
          </button>
          {save === 'saved' ? (
            <span style={{ fontSize: 12, color: 'var(--color-lp-status-complete)' }}>
              Saved ✓
            </span>
          ) : null}
          {save === 'error' && error ? (
            <span role="alert" style={{ fontSize: 12, color: 'var(--color-lp-error)' }}>
              {error}
            </span>
          ) : null}
        </div>
      </Card>

      {/* Per-user overrides */}
      <Card title="Per-user overrides">
        {members.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--lp-text-tertiary)', fontStyle: 'italic' }}>
            No workspace members found.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="lp-dense w-full">
              <thead>
                <tr
                  style={{
                    background: 'var(--lp-panel)',
                    borderBottom: '1px solid var(--lp-border-subtle)',
                  }}
                >
                  <Th>Member</Th>
                  <Th>Soft cap</Th>
                  <Th>Hard cap</Th>
                  <Th align="right">Override</Th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <OverrideRow
                    key={m.userId}
                    member={m}
                    defaultSoftMicros={savedSoft}
                    defaultHardMicros={savedHard}
                    onChanged={(next) =>
                      setMembers((prev) =>
                        prev.map((x) => (x.userId === m.userId ? next : x)),
                      )
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function OverrideRow({
  member,
  defaultSoftMicros,
  defaultHardMicros,
  onChanged,
}: {
  member: AiLimitMember;
  defaultSoftMicros: number;
  defaultHardMicros: number;
  onChanged: (next: AiLimitMember) => void;
}) {
  const hasOverride =
    member.softOverrideMicros !== null || member.hardOverrideMicros !== null;
  const [editing, setEditing] = useState(false);
  const [soft, setSoft] = useState(
    microsToUsd(member.softOverrideMicros ?? defaultSoftMicros),
  );
  const [hard, setHard] = useState(
    microsToUsd(member.hardOverrideMicros ?? defaultHardMicros),
  );
  const [busy, setBusy] = useState(false);

  const effectiveSoft = member.softOverrideMicros ?? defaultSoftMicros;
  const effectiveHard = member.hardOverrideMicros ?? defaultHardMicros;

  const put = async () => {
    const s = usdToMicros(soft);
    const h = usdToMicros(hard);
    if (s === null || h === null || h < s) return;
    setBusy(true);
    try {
      const res = await fetch('/api/ai-usage/overrides', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: member.userId,
          softCapUsdMicros: s,
          hardCapUsdMicros: h,
        }),
      });
      if (res.ok) {
        onChanged({ ...member, softOverrideMicros: s, hardOverrideMicros: h });
        setEditing(false);
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/ai-usage/overrides?userId=${encodeURIComponent(member.userId)}`,
        { method: 'DELETE' },
      );
      if (res.ok) {
        onChanged({ ...member, softOverrideMicros: null, hardOverrideMicros: null });
        setEditing(false);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr style={{ borderTop: '1px solid var(--lp-border-subtle)' }}>
      <Td>
        <span style={{ color: 'var(--lp-text)' }}>{member.label}</span>
        <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--lp-text-tertiary)', textTransform: 'uppercase' }}>
          {member.role}
        </span>
      </Td>
      {editing ? (
        <>
          <Td>
            <UsdInput value={soft} onChange={setSoft} width={84} />
          </Td>
          <Td>
            <UsdInput value={hard} onChange={setHard} width={84} />
          </Td>
          <Td align="right">
            <div className="inline-flex items-center gap-1">
              <IconBtn label="Save override" onClick={put} disabled={busy}>
                <Check size={14} style={{ color: 'var(--color-lp-status-complete)' }} />
              </IconBtn>
              <IconBtn label="Cancel" onClick={() => setEditing(false)} disabled={busy}>
                <X size={14} />
              </IconBtn>
            </div>
          </Td>
        </>
      ) : (
        <>
          <Td>
            <span className="lp-mono" style={{ color: hasOverride && member.softOverrideMicros !== null ? 'var(--lp-text)' : 'var(--lp-text-tertiary)' }}>
              {formatUsd(effectiveSoft)}
            </span>
          </Td>
          <Td>
            <span className="lp-mono" style={{ color: hasOverride && member.hardOverrideMicros !== null ? 'var(--lp-text)' : 'var(--lp-text-tertiary)' }}>
              {formatUsd(effectiveHard)}
            </span>
          </Td>
          <Td align="right">
            <div className="inline-flex items-center gap-1">
              <IconBtn label={hasOverride ? 'Edit override' : 'Add override'} onClick={() => setEditing(true)}>
                <Pencil size={13} />
              </IconBtn>
              {hasOverride ? (
                <IconBtn label="Remove override" onClick={remove} disabled={busy}>
                  <Trash2 size={13} style={{ color: 'var(--color-lp-error)' }} />
                </IconBtn>
              ) : null}
            </div>
          </Td>
        </>
      )}
    </tr>
  );
}

/* ── Small presentational helpers ───────────────────────────────── */

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      className="rounded-xl border p-5"
      style={{ borderColor: 'var(--lp-border-strong)', background: 'var(--lp-surface)' }}
    >
      <h2
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--lp-text)',
          marginBottom: 14,
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-4">
      <span style={{ fontSize: 13, color: 'var(--lp-text-secondary)' }}>{label}</span>
      {children}
    </label>
  );
}

function UsdInput({
  value,
  onChange,
  width,
}: {
  value: string;
  onChange: (v: string) => void;
  width?: number;
}) {
  return (
    <input
      type="number"
      min={0}
      step="0.01"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="lp-mono"
      style={{ ...inputStyle, width: width ?? inputStyle.width }}
    />
  );
}

function IconBtn({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="btn-transition inline-flex h-7 w-7 items-center justify-center rounded-md border disabled:opacity-50"
      style={{ borderColor: 'var(--lp-border-strong)', background: 'var(--lp-bg)', color: 'var(--lp-text-secondary)' }}
    >
      {children}
    </button>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th
      className="px-3 py-2"
      style={{
        textAlign: align ?? 'left',
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--lp-text-tertiary)',
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, align }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <td className="px-3 py-2" style={{ textAlign: align ?? 'left', verticalAlign: 'middle' }}>
      {children}
    </td>
  );
}

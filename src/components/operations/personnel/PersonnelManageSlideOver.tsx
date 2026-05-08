'use client';

/* ============================================
   LOWPASS — PersonnelManageSlideOver (Sprint 9 §6)

   Per-assignment Manage slide-over. Window-based assignment
   per Phase 6 refinement #3 — two date inputs replace the
   per-show grid. Single status applies across the window.

   Notes textarea NOT included v1: tour_personnel has no notes
   column. The Phase 6 mockup showed it speculatively; document
   in CC report. Sprint 10+ may add a notes column.

   Save: PATCH /api/tours/[id]/personnel/[memberId].
   Remove: opens <DeleteConfirmationModal>; on confirm, DELETE.
   ============================================ */

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { SlideOver } from '@/components/shell/SlideOver';
import { DeleteConfirmationModal } from '@/components/ui/DeleteConfirmationModal';
import type {
  PersonnelListItem,
  PersonnelStatus,
} from '@/lib/personnel/types';

const STATUS_OPTIONS: ReadonlyArray<{ value: PersonnelStatus; label: string }> = [
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'tentative', label: 'Tentative' },
  { value: 'awaiting_contract', label: 'Awaiting contract' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'fired', label: 'Fired' },
];

interface PersonnelManageSlideOverProps {
  open: boolean;
  tourId: string;
  member: PersonnelListItem | null;
  onClose: () => void;
  onSaved: () => void;
  onRemoved: () => void;
}

export function PersonnelManageSlideOver({
  open,
  tourId,
  member,
  onClose,
  onSaved,
  onRemoved,
}: PersonnelManageSlideOverProps) {
  const { showToast } = useToast();
  const [role, setRole] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [status, setStatus] = useState<PersonnelStatus>('confirmed');
  const [rateAmount, setRateAmount] = useState<string>('');
  const [rateCurrency, setRateCurrency] = useState<string>('GBP');
  const [ratePeriod, setRatePeriod] = useState<string>('day');
  const [saving, setSaving] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when the member changes / slide-over opens.
  useEffect(() => {
    if (!open || !member) return;
    setRole(member.role ?? '');
    setStartsOn(member.starts_on ?? '');
    setEndsOn(member.ends_on ?? '');
    setStatus(member.status);
    setRateAmount(member.rate_amount != null ? String(member.rate_amount) : '');
    setRateCurrency(member.rate_currency ?? 'GBP');
    setRatePeriod(member.rate_period ?? 'day');
    setError(null);
  }, [open, member]);

  if (!member) return null;

  const dirty =
    role !== (member.role ?? '') ||
    startsOn !== (member.starts_on ?? '') ||
    endsOn !== (member.ends_on ?? '') ||
    status !== member.status ||
    rateAmount !== (member.rate_amount != null ? String(member.rate_amount) : '') ||
    rateCurrency !== (member.rate_currency ?? 'GBP') ||
    ratePeriod !== (member.rate_period ?? 'day');

  async function handleSave() {
    if (!member) return;
    setSaving(true);
    setError(null);
    try {
      const parsedRate =
        rateAmount.trim() === '' ? null : Number(rateAmount);
      if (parsedRate != null && Number.isNaN(parsedRate)) {
        setError('Rate amount must be a number.');
        setSaving(false);
        return;
      }
      const res = await fetch(
        `/api/tours/${tourId}/personnel/${member.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            role: role.trim() || 'Crew',
            starts_on: startsOn || null,
            ends_on: endsOn || null,
            status,
            rate_amount: parsedRate,
            rate_currency: rateCurrency || null,
            rate_period: ratePeriod || null,
          }),
        },
      );
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!res.ok) {
        setError(body?.error ?? `Save failed (${res.status})`);
        return;
      }
      showToast('Personnel updated.');
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    if (!member) return;
    const res = await fetch(
      `/api/tours/${tourId}/personnel/${member.id}`,
      { method: 'DELETE' },
    );
    const body = (await res.json().catch(() => null)) as
      | { ok?: boolean; error?: string }
      | null;
    if (!res.ok) {
      throw new Error(body?.error ?? `Remove failed (${res.status})`);
    }
    showToast('Personnel removed from tour.');
    onRemoved();
  }

  return (
    <>
      <SlideOver
        open={open}
        onClose={onClose}
        title="Manage personnel"
        width="default"
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--lp-space-4)',
            padding: 'var(--lp-space-4)',
          }}
        >
          {/* Header */}
          <div>
            <div
              style={{
                fontSize: 'var(--lp-text-base)',
                fontWeight: 'var(--lp-weight-semibold)',
                color: 'var(--lp-text)',
              }}
            >
              {member.display_name}
            </div>
            <div
              style={{
                fontSize: 'var(--lp-text-sm)',
                color: 'var(--lp-text-secondary)',
              }}
            >
              {member.email ?? '—'}
            </div>
          </div>

          {/* Role */}
          <div>
            <label
              htmlFor="lp-personnel-role"
              className="lp-label-caps"
              style={{
                display: 'block',
                marginBottom: 'var(--lp-space-1)',
                fontSize: 'var(--lp-text-2xs)',
                color: 'var(--lp-text-secondary)',
              }}
            >
              Role on tour
            </label>
            <input
              id="lp-personnel-role"
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. Sound Engineer"
              style={{
                width: '100%',
                padding: 'var(--lp-space-2) var(--lp-space-3)',
                fontSize: 'var(--lp-text-sm)',
                color: 'var(--lp-text)',
                background: 'var(--lp-bg)',
                border: '1px solid var(--lp-border-strong)',
                borderRadius: 'var(--lp-radius-md)',
                outline: 'none',
              }}
            />
          </div>

          {/* Window dates */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 'var(--lp-space-3)',
            }}
          >
            <div>
              <label
                htmlFor="lp-personnel-starts"
                className="lp-label-caps"
                style={{
                  display: 'block',
                  marginBottom: 'var(--lp-space-1)',
                  fontSize: 'var(--lp-text-2xs)',
                  color: 'var(--lp-text-secondary)',
                }}
              >
                Start date
              </label>
              <input
                id="lp-personnel-starts"
                type="date"
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)}
                style={{
                  width: '100%',
                  padding: 'var(--lp-space-2) var(--lp-space-3)',
                  fontSize: 'var(--lp-text-sm)',
                  color: 'var(--lp-text)',
                  background: 'var(--lp-bg)',
                  border: '1px solid var(--lp-border-strong)',
                  borderRadius: 'var(--lp-radius-md)',
                  outline: 'none',
                }}
              />
            </div>
            <div>
              <label
                htmlFor="lp-personnel-ends"
                className="lp-label-caps"
                style={{
                  display: 'block',
                  marginBottom: 'var(--lp-space-1)',
                  fontSize: 'var(--lp-text-2xs)',
                  color: 'var(--lp-text-secondary)',
                }}
              >
                End date
              </label>
              <input
                id="lp-personnel-ends"
                type="date"
                value={endsOn}
                onChange={(e) => setEndsOn(e.target.value)}
                style={{
                  width: '100%',
                  padding: 'var(--lp-space-2) var(--lp-space-3)',
                  fontSize: 'var(--lp-text-sm)',
                  color: 'var(--lp-text)',
                  background: 'var(--lp-bg)',
                  border: '1px solid var(--lp-border-strong)',
                  borderRadius: 'var(--lp-radius-md)',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          {/* Status */}
          <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
            <legend
              className="lp-label-caps"
              style={{
                fontSize: 'var(--lp-text-2xs)',
                color: 'var(--lp-text-secondary)',
                marginBottom: 'var(--lp-space-2)',
              }}
            >
              Status
            </legend>
            <div
              className="flex flex-wrap"
              style={{ gap: 'var(--lp-space-3)' }}
            >
              {STATUS_OPTIONS.map((s) => (
                <label
                  key={s.value}
                  className="inline-flex items-center"
                  style={{
                    gap: 6,
                    fontSize: 'var(--lp-text-sm)',
                    color: 'var(--lp-text)',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="lp-personnel-status"
                    value={s.value}
                    checked={status === s.value}
                    onChange={() => setStatus(s.value)}
                    style={{ accentColor: 'var(--color-lp-orange)' }}
                  />
                  {s.label}
                </label>
              ))}
            </div>
          </fieldset>

          {/* Rate */}
          <div>
            <div
              className="lp-label-caps"
              style={{
                marginBottom: 'var(--lp-space-1)',
                fontSize: 'var(--lp-text-2xs)',
                color: 'var(--lp-text-secondary)',
              }}
            >
              Rate
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 80px 110px',
                gap: 'var(--lp-space-2)',
              }}
            >
              <input
                type="text"
                inputMode="decimal"
                value={rateAmount}
                onChange={(e) => setRateAmount(e.target.value)}
                placeholder="amount"
                style={{
                  padding: 'var(--lp-space-2) var(--lp-space-3)',
                  fontSize: 'var(--lp-text-sm)',
                  color: 'var(--lp-text)',
                  background: 'var(--lp-bg)',
                  border: '1px solid var(--lp-border-strong)',
                  borderRadius: 'var(--lp-radius-md)',
                  outline: 'none',
                }}
              />
              <input
                type="text"
                value={rateCurrency}
                onChange={(e) => setRateCurrency(e.target.value.toUpperCase().slice(0, 3))}
                placeholder="GBP"
                maxLength={3}
                style={{
                  padding: 'var(--lp-space-2) var(--lp-space-3)',
                  fontSize: 'var(--lp-text-sm)',
                  textAlign: 'center',
                  color: 'var(--lp-text)',
                  background: 'var(--lp-bg)',
                  border: '1px solid var(--lp-border-strong)',
                  borderRadius: 'var(--lp-radius-md)',
                  outline: 'none',
                }}
              />
              <select
                value={ratePeriod}
                onChange={(e) => setRatePeriod(e.target.value)}
                style={{
                  padding: 'var(--lp-space-2) var(--lp-space-3)',
                  fontSize: 'var(--lp-text-sm)',
                  color: 'var(--lp-text)',
                  background: 'var(--lp-bg)',
                  border: '1px solid var(--lp-border-strong)',
                  borderRadius: 'var(--lp-radius-md)',
                  outline: 'none',
                }}
              >
                <option value="day">per day</option>
                <option value="week">per week</option>
                <option value="flat">flat</option>
                <option value="hour">per hour</option>
              </select>
            </div>
          </div>

          {error ? (
            <div
              role="alert"
              style={{
                padding: 'var(--lp-space-2) var(--lp-space-3)',
                fontSize: 'var(--lp-text-sm)',
                color: 'var(--color-lp-error)',
                background: 'color-mix(in srgb, var(--color-lp-error) 8%, transparent)',
                border: '1px solid color-mix(in srgb, var(--color-lp-error) 25%, transparent)',
                borderRadius: 'var(--lp-radius-md)',
              }}
            >
              {error}
            </div>
          ) : null}

          {/* Footer */}
          <div
            className="flex items-center justify-between"
            style={{ gap: 'var(--lp-space-2)' }}
          >
            <button
              type="button"
              onClick={() => setRemoveOpen(true)}
              disabled={saving}
              className="btn-transition"
              style={{
                padding: 'var(--lp-space-2) var(--lp-space-3)',
                fontSize: 'var(--lp-text-sm)',
                fontWeight: 'var(--lp-weight-medium)',
                color: 'var(--color-lp-error)',
                background: 'transparent',
                border: '1px solid var(--lp-border-strong)',
                borderRadius: 'var(--lp-radius-md)',
                cursor: 'pointer',
              }}
            >
              Remove from tour
            </button>
            <div className="flex items-center" style={{ gap: 'var(--lp-space-2)' }}>
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="btn-transition"
                style={{
                  padding: 'var(--lp-space-2) var(--lp-space-4)',
                  fontSize: 'var(--lp-text-sm)',
                  color: 'var(--lp-text-secondary)',
                  background: 'transparent',
                  border: '1px solid var(--lp-border-strong)',
                  borderRadius: 'var(--lp-radius-md)',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving || !dirty}
                className="btn-transition btn-primary-press inline-flex items-center"
                style={{
                  gap: 6,
                  padding: 'var(--lp-space-2) var(--lp-space-4)',
                  fontSize: 'var(--lp-text-sm)',
                  fontWeight: 'var(--lp-weight-semibold)',
                  color: dirty ? 'var(--lp-text-inverse)' : 'var(--lp-text-tertiary)',
                  background: dirty
                    ? 'var(--color-lp-orange)'
                    : 'var(--lp-surface-hover)',
                  border: '1px solid transparent',
                  borderRadius: 'var(--lp-radius-md)',
                  cursor: dirty ? 'pointer' : 'not-allowed',
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                Save
              </button>
            </div>
          </div>
        </div>
      </SlideOver>

      <DeleteConfirmationModal
        open={removeOpen}
        itemName={`${member.display_name} from this tour`}
        description="Removes the assignment from this tour. The personnel record itself stays in your workspace library."
        onClose={() => setRemoveOpen(false)}
        onConfirm={handleRemove}
        onDeleted={onClose}
      />
    </>
  );
}

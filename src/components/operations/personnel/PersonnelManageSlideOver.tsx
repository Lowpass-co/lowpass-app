'use client';

/* ============================================
   LOWPASS — PersonnelManageSlideOver (Sprint 9 §6,
   Sprint 11 §4 auto-save adoption)

   Per-assignment Manage slide-over. Window-based assignment
   per Phase 6 refinement #3 — two date inputs replace the
   per-show grid. Single status applies across the window.

   Notes textarea NOT included v1: tour_personnel has no notes
   column. The Phase 6 mockup showed it speculatively; document
   in CC report. Sprint 10+ may add a notes column.

   Sprint 11 §4 — adopts useAutoSave: state lives in the hook
   (snapshot captured on open), every field change debounces a
   PATCH /api/tours/[id]/personnel/[memberId], the footer's
   Cancel button restores the pre-open snapshot via the hook's
   cancel() (one final PATCH back). The Save button is removed
   — the SaveStatus pill replaces it.

   Remove: opens <DeleteConfirmationModal>; on confirm, DELETE.
   ============================================ */

import { useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { SlideOver } from '@/components/shell/SlideOver';
import { DeleteConfirmationModal } from '@/components/ui/DeleteConfirmationModal';
import { useAutoSave } from '@/lib/forms/useAutoSave';
import { SaveStatus } from '@/components/forms/SaveStatus';
import { BrandedSelect } from '@/components/ui/BrandedSelect';
import { ROLE_TAG_OPTIONS, type RoleTag } from '@/lib/personnel/role-tags';
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

interface EditState {
  role: string;
  /** Sprint 12 §9c.0 — structured role discriminator. */
  roleTag: RoleTag;
  startsOn: string;
  endsOn: string;
  status: PersonnelStatus;
  rateAmount: string;
  rateCurrency: string;
  ratePeriod: string;
}

function memberToState(m: PersonnelListItem): EditState {
  return {
    role: m.role ?? '',
    roleTag: (m.role_tag ?? 'other') as RoleTag,
    startsOn: m.starts_on ?? '',
    endsOn: m.ends_on ?? '',
    status: m.status,
    rateAmount: m.rate_amount != null ? String(m.rate_amount) : '',
    rateCurrency: m.rate_currency ?? 'GBP',
    ratePeriod: m.rate_period ?? 'day',
  };
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
  const [removeOpen, setRemoveOpen] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  /* The hook captures `initialState` on first mount. We remount
     the editor via a `key` whenever the slide-over opens with a
     different member, so the snapshot always reflects the
     freshly-loaded server state. The wrapper below handles
     gating + remount. */
  if (!member) return null;

  return (
    <PersonnelManageEditor
      key={`${member.id}:${open ? 'open' : 'closed'}`}
      open={open}
      tourId={tourId}
      member={member}
      onClose={onClose}
      onSaved={onSaved}
      onRemoved={onRemoved}
      removeOpen={removeOpen}
      setRemoveOpen={setRemoveOpen}
      validationError={validationError}
      setValidationError={setValidationError}
      showToast={showToast}
    />
  );
}

interface EditorProps {
  open: boolean;
  tourId: string;
  member: PersonnelListItem;
  onClose: () => void;
  onSaved: () => void;
  onRemoved: () => void;
  removeOpen: boolean;
  setRemoveOpen: (v: boolean) => void;
  validationError: string | null;
  setValidationError: (v: string | null) => void;
  showToast: (msg: string) => void;
}

function PersonnelManageEditor({
  open,
  tourId,
  member,
  onClose,
  onSaved,
  onRemoved,
  removeOpen,
  setRemoveOpen,
  validationError,
  setValidationError,
  showToast,
}: EditorProps) {
  /* useAutoSave owns state. On every set() call the hook
     debounces 600ms and fires onSave with the latest state.
     onSave validates rate_amount as a number; if it fails we
     surface a transient validationError without throwing — the
     hook keeps trying on the next field change. Throwing would
     flip status to 'error' and require the user to dismiss the
     pill, which is too noisy for typing-into-a-half-finished-
     number. */
  const {
    state,
    set,
    status,
    lastSavedAt,
    errorMessage,
    cancel,
    flushSave,
  } = useAutoSave<EditState>({
    initialState: memberToState(member),
    onSave: async (s) => {
      const trimmedRate = s.rateAmount.trim();
      const parsedRate = trimmedRate === '' ? null : Number(trimmedRate);
      if (parsedRate != null && Number.isNaN(parsedRate)) {
        setValidationError('Rate amount must be a number.');
        // Don't throw — keep status='saving' from flipping; the
        // user is mid-edit. Skip the PATCH this round.
        return;
      }
      setValidationError(null);
      const res = await fetch(
        `/api/tours/${tourId}/personnel/${member.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            role: s.role.trim() || 'Crew',
            role_tag: s.roleTag,
            starts_on: s.startsOn || null,
            ends_on: s.endsOn || null,
            status: s.status,
            rate_amount: parsedRate,
            rate_currency: s.rateCurrency || null,
            rate_period: s.ratePeriod || null,
          }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(body?.error ?? `Save failed (${res.status})`);
      }
      onSaved();
    },
  });

  // Close handler: flush any pending save BEFORE closing so the
  // last keystroke isn't lost. If the user wants to bail, they
  // hit Cancel (not the X / overlay click).
  const handleClose = async () => {
    await flushSave();
    onClose();
  };

  const handleCancel = async () => {
    await cancel();
    showToast('Changes reverted.');
    onClose();
  };

  async function handleRemove() {
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
        onClose={() => void handleClose()}
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
              value={state.role}
              onChange={(e) => set((p) => ({ ...p, role: e.target.value }))}
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

          {/* Sprint 12 §9c.0 — Role tag select. Filter target
              for the variable resolver; freeform Role above
              stays the canonical Key Contacts display value. */}
          <div>
            <label
              htmlFor="lp-personnel-role-tag"
              className="lp-label-caps"
              style={{
                display: 'block',
                marginBottom: 'var(--lp-space-1)',
                fontSize: 'var(--lp-text-2xs)',
                color: 'var(--lp-text-secondary)',
              }}
            >
              Role tag (for rider variables)
            </label>
            <BrandedSelect
              value={state.roleTag}
              onChange={(v) => set((p) => ({ ...p, roleTag: v as RoleTag }))}
              options={ROLE_TAG_OPTIONS.map((o) => ({
                value: o.value,
                label: `${o.label} — ${o.description}`,
              }))}
              ariaLabel="Role tag"
              size="sm"
              className="w-full"
              triggerClassName="min-h-9 w-full"
            />
          </div>

          {/* Window dates */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
              gap: 'var(--lp-space-3)',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <label
                htmlFor="lp-personnel-starts"
                className="lp-label-caps"
                style={{
                  display: 'block',
                  marginBottom: 'var(--lp-space-1)',
                  fontSize: 'var(--lp-text-xs)',
                  fontWeight: 'var(--lp-weight-semibold)',
                  color: 'var(--lp-text)',
                }}
              >
                Start date
              </label>
              <input
                id="lp-personnel-starts"
                type="date"
                value={state.startsOn}
                onChange={(e) => set((p) => ({ ...p, startsOn: e.target.value }))}
                style={{
                  width: '100%',
                  minWidth: 0,
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
            <div style={{ minWidth: 0 }}>
              <label
                htmlFor="lp-personnel-ends"
                className="lp-label-caps"
                style={{
                  display: 'block',
                  marginBottom: 'var(--lp-space-1)',
                  fontSize: 'var(--lp-text-xs)',
                  fontWeight: 'var(--lp-weight-semibold)',
                  color: 'var(--lp-text)',
                }}
              >
                End date
              </label>
              <input
                id="lp-personnel-ends"
                type="date"
                value={state.endsOn}
                onChange={(e) => set((p) => ({ ...p, endsOn: e.target.value }))}
                style={{
                  width: '100%',
                  minWidth: 0,
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

          {/* Status pills */}
          <fieldset
            role="radiogroup"
            aria-label="Status"
            style={{ border: 'none', padding: 0, margin: 0 }}
          >
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
            <div className="flex flex-wrap" style={{ gap: 'var(--lp-space-2)' }}>
              {STATUS_OPTIONS.map((s) => {
                const active = state.status === s.value;
                const destructive = s.value === 'cancelled' || s.value === 'fired';
                return (
                  <button
                    key={s.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => set((p) => ({ ...p, status: s.value }))}
                    className="btn-transition"
                    style={{
                      padding: 'var(--lp-space-1) var(--lp-space-3)',
                      fontSize: 'var(--lp-text-sm)',
                      fontWeight: active
                        ? 'var(--lp-weight-semibold)'
                        : 'var(--lp-weight-medium)',
                      color: active
                        ? 'var(--lp-text-inverse)'
                        : 'var(--lp-text-secondary)',
                      background: active
                        ? destructive
                          ? 'var(--color-lp-error)'
                          : 'var(--color-lp-orange)'
                        : 'var(--lp-bg-tertiary)',
                      border: '1px solid transparent',
                      borderRadius: 999,
                      cursor: 'pointer',
                      boxShadow: active
                        ? '0 1px 2px color-mix(in srgb, black 15%, transparent)'
                        : 'none',
                    }}
                  >
                    {s.label}
                  </button>
                );
              })}
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
                value={state.rateAmount}
                onChange={(e) => set((p) => ({ ...p, rateAmount: e.target.value }))}
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
                value={state.rateCurrency}
                onChange={(e) =>
                  set((p) => ({ ...p, rateCurrency: e.target.value.toUpperCase().slice(0, 3) }))
                }
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
                value={state.ratePeriod}
                onChange={(e) => set((p) => ({ ...p, ratePeriod: e.target.value }))}
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

          {validationError ? (
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
              {validationError}
            </div>
          ) : null}

          {/* Footer — Save button is gone; SaveStatus pill is the
              only feedback. Cancel restores the open-time
              snapshot via the hook. */}
          <div
            className="flex items-center justify-between"
            style={{ gap: 'var(--lp-space-2)' }}
          >
            <button
              type="button"
              onClick={() => setRemoveOpen(true)}
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
              <SaveStatus
                status={status}
                lastSavedAt={lastSavedAt}
                errorMessage={errorMessage}
                onRetry={() => void flushSave()}
              />
              <button
                type="button"
                onClick={() => void handleCancel()}
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
                title="Discard the changes you just made."
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleClose()}
                className="btn-transition btn-primary-press inline-flex items-center"
                style={{
                  gap: 6,
                  padding: 'var(--lp-space-2) var(--lp-space-4)',
                  fontSize: 'var(--lp-text-sm)',
                  fontWeight: 'var(--lp-weight-semibold)',
                  color: 'var(--lp-text-inverse)',
                  background: 'var(--color-lp-orange)',
                  border: '1px solid transparent',
                  borderRadius: 'var(--lp-radius-md)',
                  cursor: 'pointer',
                }}
              >
                Done
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

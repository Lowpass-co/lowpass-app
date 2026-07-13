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

import { useEffect, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { SlideOver } from '@/components/shell/SlideOver';
import { DeleteConfirmationModal } from '@/components/ui/DeleteConfirmationModal';
import { SwapPersonnelModal } from './SwapPersonnelModal';
import { useAutoSave } from '@/lib/forms/useAutoSave';
import { SaveStatus } from '@/components/forms/SaveStatus';
import { BrandedSelect } from '@/components/ui/BrandedSelect';
import { ROLE_TAG_OPTIONS, type RoleTag } from '@/lib/personnel/role-tags';
import { PersonnelRatesSection } from './PersonnelRatesSection';
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
    // Rates SSOT — the retired tour_personnel daily-rate column is no longer
    // read (pay reads personnel_rate_lines). This field is vestigial UI state.
    rateAmount: '',
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
     onSave validates the daily-rate field as a number; if it fails we
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
      // #18 SSOT — rates are NOT edited here anymore. Payroll's Rates grid owns
      // rate editing (personnel_rates); the dangling tour_personnel simple rate
      // (daily-rate/currency/period) is no longer written. This slide persists
      // only the assignment meta (role / tag / dates / status).
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

  /* Phase 3 — fetch exactly what cascades on removal so the confirm
     dialog lists it. Fetched when the remove modal opens (not on every
     edit). The DB FKs (mig 204) do the cascade; this is read-only. */
  const [swapOpen, setSwapOpen] = useState(false);
  const [removalPreview, setRemovalPreview] = useState<{
    rateCards: number;
    roomAssignments: number;
    budgetLines: number;
    sharedRooms: number;
  } | null>(null);
  useEffect(() => {
    if (!removeOpen) return;
    let active = true;
    // Clear any stale preview from a previous member before refetching.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRemovalPreview(null);
    void (async () => {
      try {
        const res = await fetch(
          `/api/tours/${tourId}/personnel/${member.id}/removal-preview`,
        );
        if (!res.ok) return;
        const data = (await res.json()) as typeof removalPreview;
        if (active) setRemovalPreview(data);
      } catch {
        /* preview is best-effort — removal still works without it */
      }
    })();
    return () => {
      active = false;
    };
  }, [removeOpen, tourId, member.id]);

  const removalDescription = (() => {
    const parts: string[] = [];
    if (!removalPreview) {
      parts.push('Also removes their rate card, room assignments, and any derived budget lines.');
    } else {
      const bits: string[] = [];
      if (removalPreview.rateCards > 0) bits.push('their payroll rate card');
      if (removalPreview.roomAssignments > 0)
        bits.push(
          `${removalPreview.roomAssignments} room assignment${removalPreview.roomAssignments === 1 ? '' : 's'}`,
        );
      if (removalPreview.budgetLines > 0)
        bits.push(
          `${removalPreview.budgetLines} derived budget line${removalPreview.budgetLines === 1 ? '' : 's'}`,
        );
      parts.push(
        bits.length > 0
          ? `Also removes ${bits.join(', ')}.`
          : 'No rate card, rooms, or budget lines are attached.',
      );
      if (removalPreview.sharedRooms > 0) {
        parts.push(
          `Shared room: the roommate keeps their assignment — only this person's occupancy clears.`,
        );
      }
    }
    parts.push('The personnel record itself stays in your workspace library.');
    return parts.join(' ');
  })();

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
              className="lp-mono"
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

          {/* #18 SSOT — the dangling simple "Rate" field (tour_personnel
              daily-rate/currency/period) is removed: payroll IGNORED it, and it
              was the confusing third rate surface. Rates are edited ONCE, in the
              payroll Rates grid; PersonnelRatesSection below shows them read-only. */}

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

          {/* §P2 — payroll rates (show / travel / per-diem +
              admin-only internal "Lowpass" rate). Targets
              personnel_rates, separate from the single
              daily-rate field above which lives on
              tour_personnel. Self-contained: own fetch +
              per-field auto-save. Currency hint from the
              assignment's rate currency (falls back to GBP). */}
          <div
            style={{
              paddingTop: 'var(--lp-space-3)',
              borderTop: '1px solid var(--lp-border)',
            }}
          >
            <PersonnelRatesSection
              tourId={tourId}
              memberId={member.id}
              personId={member.person_id}
              currency={state.rateCurrency || 'GBP'}
              readOnly
            />
          </div>

          {/* Footer — Save button is gone; SaveStatus pill is the
              only feedback. Cancel restores the open-time
              snapshot via the hook. */}
          <div
            className="flex items-center justify-between"
            style={{ gap: 'var(--lp-space-2)' }}
          >
            <div className="flex items-center" style={{ gap: 'var(--lp-space-2)' }}>
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
              <button
                type="button"
                onClick={() => setSwapOpen(true)}
                className="btn-transition"
                style={{
                  padding: 'var(--lp-space-2) var(--lp-space-3)',
                  fontSize: 'var(--lp-text-sm)',
                  fontWeight: 'var(--lp-weight-medium)',
                  color: 'var(--lp-text-secondary)',
                  background: 'transparent',
                  border: '1px solid var(--lp-border-strong)',
                  borderRadius: 'var(--lp-radius-md)',
                  cursor: 'pointer',
                }}
                title="Replace this person with another — transfers their rate card, rooms, and budget lines"
              >
                Swap…
              </button>
            </div>
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
        description={removalDescription}
        onClose={() => setRemoveOpen(false)}
        onConfirm={handleRemove}
        onDeleted={onClose}
      />

      <SwapPersonnelModal
        open={swapOpen}
        tourId={tourId}
        member={{
          id: member.id,
          display_name: member.display_name,
          person_id: member.person_id,
        }}
        onClose={() => setSwapOpen(false)}
        onSwapped={() => {
          onSaved();
          onClose();
        }}
      />
    </>
  );
}

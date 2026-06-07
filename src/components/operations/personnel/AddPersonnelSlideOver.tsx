'use client';

/* ============================================
   LOWPASS — AddPersonnelSlideOver (Sprint 9 §6 + §11.1 + §11.2)

   Search-first "+ Add personnel" flow. Searches existing
   persons in the tour's workspace via
   /api/tours/[id]/personnel/search?q=...&exclude=...

   Sprint 9 §11.1 — when the slide-over opens, the assignment
   form's start_date / end_date default to the tour's window
   (passed in as props) so the operator doesn't retype them on
   every assignment. Both fields stay editable.

   Sprint 9 §11.2 — when the search returns no matches, an
   inline "+ Create new person" panel expands a tiny form
   (name + email + role) and on submit:
     1. POSTs /api/personnel (workspace personnel)
     2. POSTs /api/tours/[id]/personnel using the new person's id
        + the assignment defaults (role from the inline form,
        tour-window dates, status='confirmed', no rate).
   The two calls happen sequentially; if step 2 fails, the
   workspace person row still exists (operator can manually
   assign from the manage flow). The flow lets ops add a new
   crew member without leaving the tour context.

   On click of a search result, the slide-over expands to show
   the full assignment form (role / window / status / rate).
   Submit POSTs to /api/tours/[id]/personnel.
   ============================================ */

import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2, Plus, Search, UserPlus } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { SlideOver } from '@/components/shell/SlideOver';
import { BrandedSelect } from '@/components/ui/BrandedSelect';
import { ROLE_TAG_OPTIONS, type RoleTag } from '@/lib/personnel/role-tags';
import type {
  PersonnelSearchHit,
  PersonnelStatus,
} from '@/lib/personnel/types';

const STATUS_OPTIONS: ReadonlyArray<{ value: PersonnelStatus; label: string }> = [
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'tentative', label: 'Tentative' },
  { value: 'awaiting_contract', label: 'Awaiting contract' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'fired', label: 'Fired' },
];

interface AddPersonnelSlideOverProps {
  open: boolean;
  tourId: string;
  /** person_ids already assigned — excluded from search results. */
  excludePersonIds: string[];
  /** Sprint 9 §11.1 — defaults for the assignment window. When
   *  the operator opens the slide-over, the start/end date
   *  inputs are pre-filled with the tour's window. Both stay
   *  editable. Pass null when the tour has no window set. */
  tourStartDate?: string | null;
  tourEndDate?: string | null;
  onClose: () => void;
  /** Called after a successful assignment. Receives the POST result
   *  (incl. the seeded rate card) so callers can update optimistically
   *  without a router.refresh. The Personnel page ignores the arg. */
  onAdded: (result?: {
    id?: string;
    rateCard?: Record<string, unknown> | null;
  }) => void;
}

export function AddPersonnelSlideOver({
  open,
  tourId,
  excludePersonIds,
  tourStartDate = null,
  tourEndDate = null,
  onClose,
  onAdded,
}: AddPersonnelSlideOverProps) {
  const { showToast } = useToast();
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [hits, setHits] = useState<PersonnelSearchHit[]>([]);
  const [picked, setPicked] = useState<PersonnelSearchHit | null>(null);

  // Form state (post-pick)
  const [role, setRole] = useState('Crew');
  /* Sprint 12 §9c.0 — structured role_tag. Defaults to 'other'
     so the operator gets a sensible no-tag baseline; the
     freeform role text above stays the canonical display
     string in the rider Key Contacts table. */
  const [roleTag, setRoleTag] = useState<RoleTag>('other');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [status, setStatus] = useState<PersonnelStatus>('confirmed');
  const [rateAmount, setRateAmount] = useState('');
  const [rateCurrency, setRateCurrency] = useState('GBP');
  const [ratePeriod, setRatePeriod] = useState('day');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sprint 9 §11.2 — inline create-new-person flow when search
  // turns up nothing. State is segregated from the search /
  // pick path so toggling between modes doesn't bleed values.
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createRole, setCreateRole] = useState('Crew');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset everything when the slide-over closes/reopens.
  // Sprint 9 §11.1 — start/end default to the tour window.
  useEffect(() => {
    if (!open) return;
    setQ('');
    setHits([]);
    setPicked(null);
    setRole('Crew');
    setRoleTag('other');
    setStartsOn(tourStartDate ?? '');
    setEndsOn(tourEndDate ?? '');
    setStatus('confirmed');
    setRateAmount('');
    setRateCurrency('GBP');
    setRatePeriod('day');
    setSubmitting(false);
    setError(null);
    setCreateOpen(false);
    setCreateName('');
    setCreateEmail('');
    setCreateRole('Crew');
    setCreating(false);
    setCreateError(null);
  }, [open, tourStartDate, tourEndDate]);

  // Debounced search.
  useEffect(() => {
    if (!open || picked) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams();
        if (q.trim()) params.set('q', q.trim());
        if (excludePersonIds.length > 0) {
          params.set('exclude', excludePersonIds.join(','));
        }
        const res = await fetch(
          `/api/tours/${tourId}/personnel/search?${params.toString()}`,
        );
        if (res.ok) {
          const body = (await res.json()) as { persons: PersonnelSearchHit[] };
          setHits(body.persons);
        }
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q, open, picked, tourId, excludePersonIds]);

  /* Sprint 9 §11.2 — inline create-new-person submit. Two
     sequential POSTs: workspace personnel first, then tour
     assignment. If step 2 fails the workspace person row
     still exists (operator can assign manually); we surface
     a softer error message in that case so they know what
     happened. Defaults: tour-window dates, status='confirmed',
     no rate. The operator can edit later via the manage
     slide-over. */
  async function handleCreateAndAssign() {
    setCreateError(null);
    const name = createName.trim();
    const email = createEmail.trim() || null;
    const inlineRole = createRole.trim() || 'Crew';
    if (!name) {
      setCreateError('Name is required.');
      return;
    }
    setCreating(true);
    try {
      // Step 1: workspace personnel.
      const personRes = await fetch('/api/personnel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, role: inlineRole }),
      });
      const personBody = (await personRes.json().catch(() => null)) as
        | { id?: string; error?: string }
        | null;
      if (!personRes.ok || !personBody?.id) {
        setCreateError(personBody?.error ?? 'Could not create personnel.');
        return;
      }

      // Step 2: tour_personnel assignment with defaults.
      const assignRes = await fetch(`/api/tours/${tourId}/personnel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          person_id: personBody.id,
          role: inlineRole,
          starts_on: tourStartDate ?? null,
          ends_on: tourEndDate ?? null,
          status: 'confirmed',
          rate_amount: null,
          rate_currency: null,
          rate_period: null,
        }),
      });
      const assignBody = (await assignRes.json().catch(() => null)) as
        | { id?: string; rateCard?: Record<string, unknown> | null; error?: string }
        | null;
      if (!assignRes.ok) {
        // Workspace person row was created — surface that so
        // the operator knows where to find them.
        setCreateError(
          `${name} was added to the workspace but couldn't be assigned to this tour: ${
            assignBody?.error ?? `${assignRes.status}`
          }. Open Personnel from the side panel to assign manually.`,
        );
        return;
      }
      showToast(`${name} created and added to tour.`);
      onAdded(assignBody ?? undefined);
      onClose();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setCreating(false);
    }
  }

  async function handleAdd() {
    if (!picked) return;
    setSubmitting(true);
    setError(null);
    try {
      const parsedRate =
        rateAmount.trim() === '' ? null : Number(rateAmount);
      if (parsedRate != null && Number.isNaN(parsedRate)) {
        setError('Rate amount must be a number.');
        setSubmitting(false);
        return;
      }
      const res = await fetch(`/api/tours/${tourId}/personnel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          person_id: picked.id,
          role: role.trim() || 'Crew',
          role_tag: roleTag,
          starts_on: startsOn || null,
          ends_on: endsOn || null,
          status,
          rate_amount: parsedRate,
          rate_currency: rateCurrency || null,
          rate_period: ratePeriod || null,
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | { id?: string; rateCard?: Record<string, unknown> | null; error?: string }
        | null;
      if (!res.ok) {
        if (res.status === 409) {
          setError(`${picked.display_name} is already assigned to this tour.`);
        } else {
          setError(body?.error ?? `Add failed (${res.status})`);
        }
        return;
      }
      showToast(`${picked.display_name} added to tour.`);
      onAdded(body ?? undefined);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title="Add personnel"
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
        {!picked ? (
          <>
            {/* Search input */}
            <div>
              <label
                htmlFor="lp-add-personnel-search"
                className="lp-label-caps"
                style={{
                  display: 'block',
                  marginBottom: 'var(--lp-space-1)',
                  fontSize: 'var(--lp-text-2xs)',
                  color: 'var(--lp-text-secondary)',
                }}
              >
                Search workspace personnel
              </label>
              <div
                className="flex items-center"
                style={{
                  gap: 6,
                  padding: 'var(--lp-space-2) var(--lp-space-3)',
                  background: 'var(--lp-bg)',
                  border: '1px solid var(--lp-border-strong)',
                  borderRadius: 'var(--lp-radius-md)',
                }}
              >
                <Search
                  size={14}
                  strokeWidth={2.4}
                  style={{ color: 'var(--lp-text-tertiary)', flexShrink: 0 }}
                />
                <input
                  id="lp-add-personnel-search"
                  type="text"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Name, email, or phone…"
                  autoComplete="off"
                  spellCheck={false}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 'var(--lp-text-sm)',
                    color: 'var(--lp-text)',
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                  }}
                />
                {searching ? (
                  <Loader2
                    size={12}
                    className="animate-spin"
                    style={{ color: 'var(--lp-text-tertiary)' }}
                  />
                ) : null}
              </div>
            </div>

            {/* Results */}
            <div>
              {hits.length === 0 && !searching ? (
                <div
                  style={{
                    padding: 'var(--lp-space-4)',
                    textAlign: 'center',
                    fontSize: 'var(--lp-text-sm)',
                    color: 'var(--lp-text-tertiary)',
                    background: 'var(--lp-panel)',
                    border: '1px dashed var(--lp-border-strong)',
                    borderRadius: 'var(--lp-radius-md)',
                  }}
                >
                  {q.trim()
                    ? 'No matches in this workspace.'
                    : 'Start typing to search workspace personnel.'}
                </div>
              ) : (
                <ul
                  style={{
                    listStyle: 'none',
                    padding: 0,
                    margin: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--lp-space-1)',
                  }}
                >
                  {hits.map((h) => (
                    <li key={h.id}>
                      <button
                        type="button"
                        onClick={() => setPicked(h)}
                        className="btn-transition flex w-full items-center"
                        style={{
                          gap: 'var(--lp-space-2)',
                          padding: 'var(--lp-space-2) var(--lp-space-3)',
                          fontSize: 'var(--lp-text-sm)',
                          color: 'var(--lp-text)',
                          background: 'var(--lp-surface)',
                          border: '1px solid var(--lp-border-subtle)',
                          borderRadius: 'var(--lp-radius-md)',
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                      >
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span
                            className="block truncate"
                            style={{ fontWeight: 'var(--lp-weight-medium)' }}
                          >
                            {h.display_name}
                          </span>
                          {h.email ? (
                            <span
                              className="block truncate"
                              style={{
                                fontSize: 'var(--lp-text-xs)',
                                color: 'var(--lp-text-tertiary)',
                              }}
                            >
                              {h.email}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Sprint 9 §11.2 — inline create-new-person panel.
                The collapsed state shows the prompt + button;
                the expanded state shows a tiny form (name +
                email + role) with submit/cancel. The Personnel
                library escape-hatch link stays as a secondary
                fallback for operators who want the full editor. */}
            <div
              style={{
                padding: 'var(--lp-space-3)',
                background: 'var(--lp-panel)',
                border: '1px solid var(--lp-border-subtle)',
                borderRadius: 'var(--lp-radius-md)',
              }}
            >
              {!createOpen ? (
                <div className="flex items-center justify-between" style={{ gap: 'var(--lp-space-2)' }}>
                  <div
                    style={{
                      fontSize: 'var(--lp-text-sm)',
                      color: 'var(--lp-text-secondary)',
                    }}
                  >
                    Person not in this workspace?
                  </div>
                  <button
                    type="button"
                    onClick={() => setCreateOpen(true)}
                    className="btn-transition inline-flex items-center"
                    style={{
                      gap: 4,
                      padding: 'var(--lp-space-1) var(--lp-space-3)',
                      fontSize: 'var(--lp-text-sm)',
                      fontWeight: 'var(--lp-weight-semibold)',
                      color: 'var(--color-lp-orange)',
                      background: 'transparent',
                      border: '1px solid color-mix(in srgb, var(--color-lp-orange) 35%, transparent)',
                      borderRadius: 'var(--lp-radius-md)',
                      cursor: 'pointer',
                    }}
                  >
                    <Plus size={12} strokeWidth={2.4} />
                    Create new person
                  </button>
                </div>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--lp-space-3)',
                  }}
                >
                  <div className="inline-flex items-center" style={{ gap: 6 }}>
                    <UserPlus size={14} strokeWidth={2.4} style={{ color: 'var(--color-lp-orange)' }} />
                    <span
                      style={{
                        fontSize: 'var(--lp-text-sm)',
                        fontWeight: 'var(--lp-weight-semibold)',
                        color: 'var(--lp-text)',
                      }}
                    >
                      Create new person
                    </span>
                  </div>
                  <div>
                    <label
                      htmlFor="lp-add-personnel-create-name"
                      className="lp-label-caps"
                      style={{
                        display: 'block',
                        marginBottom: 'var(--lp-space-1)',
                        fontSize: 'var(--lp-text-2xs)',
                        color: 'var(--lp-text-secondary)',
                      }}
                    >
                      Name
                    </label>
                    <input
                      id="lp-add-personnel-create-name"
                      type="text"
                      value={createName}
                      onChange={(e) => setCreateName(e.target.value)}
                      placeholder="Full name"
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
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 'var(--lp-space-2)',
                    }}
                  >
                    <div>
                      <label
                        htmlFor="lp-add-personnel-create-email"
                        className="lp-label-caps"
                        style={{
                          display: 'block',
                          marginBottom: 'var(--lp-space-1)',
                          fontSize: 'var(--lp-text-2xs)',
                          color: 'var(--lp-text-secondary)',
                        }}
                      >
                        Email (optional)
                      </label>
                      <input
                        id="lp-add-personnel-create-email"
                        type="email"
                        value={createEmail}
                        onChange={(e) => setCreateEmail(e.target.value)}
                        placeholder="name@example.com"
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
                        htmlFor="lp-add-personnel-create-role"
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
                        id="lp-add-personnel-create-role"
                        type="text"
                        value={createRole}
                        onChange={(e) => setCreateRole(e.target.value)}
                        placeholder="e.g. Crew"
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
                  <p
                    style={{
                      margin: 0,
                      fontSize: 'var(--lp-text-xs)',
                      color: 'var(--lp-text-tertiary)',
                    }}
                  >
                    {tourStartDate && tourEndDate
                      ? `Will be assigned for the full tour window (${tourStartDate} → ${tourEndDate}) with status “Confirmed”. Edit later from the manage panel.`
                      : 'Will be assigned with status “Confirmed”. Edit dates + rate later from the manage panel.'}
                  </p>
                  {createError ? (
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
                      {createError}
                    </div>
                  ) : null}
                  <div className="flex justify-end" style={{ gap: 'var(--lp-space-2)' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setCreateOpen(false);
                        setCreateError(null);
                      }}
                      disabled={creating}
                      className="btn-transition"
                      style={{
                        padding: 'var(--lp-space-1) var(--lp-space-3)',
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
                      onClick={() => void handleCreateAndAssign()}
                      disabled={creating}
                      className="btn-transition btn-primary-press inline-flex items-center"
                      style={{
                        gap: 6,
                        padding: 'var(--lp-space-1) var(--lp-space-3)',
                        fontSize: 'var(--lp-text-sm)',
                        fontWeight: 'var(--lp-weight-semibold)',
                        color: 'var(--lp-text-inverse)',
                        background: 'var(--color-lp-orange)',
                        border: '1px solid transparent',
                        borderRadius: 'var(--lp-radius-md)',
                        cursor: creating ? 'not-allowed' : 'pointer',
                        opacity: creating ? 0.7 : 1,
                      }}
                    >
                      {creating ? <Loader2 size={14} className="animate-spin" /> : null}
                      Create &amp; assign
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Library escape-hatch — secondary fallback for the
                full editor (passport, files, etc.). */}
            <div
              style={{
                fontSize: 'var(--lp-text-xs)',
                color: 'var(--lp-text-tertiary)',
              }}
            >
              Need to fill in passport / files / pay rates first?{' '}
              <a
                href="/personnel"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center"
                style={{
                  gap: 2,
                  color: 'var(--color-lp-orange)',
                  textDecoration: 'underline',
                }}
              >
                Open Personnel library
                <ExternalLink size={10} strokeWidth={2.4} />
              </a>
            </div>
          </>
        ) : (
          <>
            {/* Picked person + back link */}
            <div>
              <button
                type="button"
                onClick={() => setPicked(null)}
                className="btn-transition"
                style={{
                  padding: 0,
                  fontSize: 'var(--lp-text-xs)',
                  fontWeight: 'var(--lp-weight-medium)',
                  color: 'var(--lp-text-secondary)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                ← Pick a different person
              </button>
              <div
                style={{
                  marginTop: 'var(--lp-space-2)',
                  fontSize: 'var(--lp-text-base)',
                  fontWeight: 'var(--lp-weight-semibold)',
                  color: 'var(--lp-text)',
                }}
              >
                {picked.display_name}
              </div>
              {picked.email ? (
                <div
                  style={{
                    fontSize: 'var(--lp-text-sm)',
                    color: 'var(--lp-text-secondary)',
                  }}
                >
                  {picked.email}
                </div>
              ) : null}
            </div>

            {/* Role */}
            <div>
              <label
                htmlFor="lp-add-personnel-role"
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
                id="lp-add-personnel-role"
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

            {/* Sprint 12 §9c.0 — Role tag select.
                Structured discriminator for the variable
                resolver. The freeform "Role on tour" above
                still renders in the rider's Key Contacts
                table — this dropdown only feeds
                {contact.<tag>.*} substitution. */}
            <div>
              <label
                htmlFor="lp-add-personnel-role-tag"
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
                value={roleTag}
                onChange={(v) => setRoleTag(v as RoleTag)}
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

            {/* Window */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 'var(--lp-space-3)',
              }}
            >
              <div>
                <label
                  htmlFor="lp-add-personnel-starts"
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
                  id="lp-add-personnel-starts"
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
                  htmlFor="lp-add-personnel-ends"
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
                  id="lp-add-personnel-ends"
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
                      name="lp-add-personnel-status"
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
                Rate (optional)
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
            <div className="flex justify-end" style={{ gap: 'var(--lp-space-2)' }}>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
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
                onClick={() => void handleAdd()}
                disabled={submitting}
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
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
                Add
              </button>
            </div>
          </>
        )}
      </div>
    </SlideOver>
  );
}

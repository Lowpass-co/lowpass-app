'use client';

/* ============================================
   LOWPASS — AddPersonnelSlideOver (Sprint 9 §6)

   Search-only "+ Add personnel" flow per Phase 6 sign-off
   refinement #2. Searches existing persons in the tour's
   workspace via /api/tours/[id]/personnel/search?q=...&exclude=...
   When the user finds nobody, the slide-over footer links to
   the Personnel library page in a new tab to create a new
   person there.

   On click of a search result, the slide-over expands to show
   the assignment form (role / employment_type / rate / window
   / status). Submit POSTs to /api/tours/[id]/personnel.
   ============================================ */

import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2, Search } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { SlideOver } from '@/components/shell/SlideOver';
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
  onClose: () => void;
  onAdded: () => void;
}

export function AddPersonnelSlideOver({
  open,
  tourId,
  excludePersonIds,
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
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [status, setStatus] = useState<PersonnelStatus>('confirmed');
  const [rateAmount, setRateAmount] = useState('');
  const [rateCurrency, setRateCurrency] = useState('GBP');
  const [ratePeriod, setRatePeriod] = useState('day');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset everything when the slide-over closes/reopens.
  useEffect(() => {
    if (!open) return;
    setQ('');
    setHits([]);
    setPicked(null);
    setRole('Crew');
    setStartsOn('');
    setEndsOn('');
    setStatus('confirmed');
    setRateAmount('');
    setRateCurrency('GBP');
    setRatePeriod('day');
    setSubmitting(false);
    setError(null);
  }, [open]);

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
          starts_on: startsOn || null,
          ends_on: endsOn || null,
          status,
          rate_amount: parsedRate,
          rate_currency: rateCurrency || null,
          rate_period: ratePeriod || null,
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | { id?: string; error?: string }
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
      onAdded();
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

            {/* Library escape-hatch */}
            <div
              style={{
                fontSize: 'var(--lp-text-xs)',
                color: 'var(--lp-text-tertiary)',
              }}
            >
              Person not in this workspace?{' '}
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
                Add them in Personnel library
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

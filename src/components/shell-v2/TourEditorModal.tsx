'use client';

/* ============================================
   LOWPASS — <TourEditorModal>

   ONE modal for create AND edit of a tour (Adam: "edit in this window; the drawer
   doesn't make sense"). Replaces the full-page wizard + the TourCreateSlideOver
   drawer + the EditTourSlideOver drawer. Mounted once at root by TourEditorProvider;
   opened via useTourEditor().openCreateTour() / openEditTour(id).

   Pinned visual spec: <Modal size="xl"> (wide, both tabs) · tabbed header
   Details | Routing (active tab underlined in orange) · quiet sentence-case labels ·
   orange restraint (primary CTA + active-tab underline + focus ring only).

   Step 1 (Details): Artist (Existing/New for create; locked on edit) · Name · Dates ·
   Region · Currency. NO party-size counts (staffing lives in personnel).
   Step 2 (Routing): the venue-first RoutingGrid, one row per date.

   Minimum to create = artist + name + dates (routing fully skippable).
   ============================================ */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { TOUR_CURRENCIES, DEFAULT_TOUR_CURRENCY } from '@/lib/currencies';
import { RoutingGrid, type RoutingRow } from '@/components/routing/RoutingGrid';

const REGION_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'UK', label: 'UK' },
  { value: 'EU', label: 'EU' },
  { value: 'US', label: 'US' },
  { value: 'AUS', label: 'AUS' },
  { value: 'ASIA', label: 'ASIA' },
  { value: 'GLOBAL', label: 'Global' },
  { value: 'OTHER', label: 'Other' },
];

export interface TourArtistOption {
  id: string;
  name: string;
}

/** Existing tour facts for edit mode (loaded by the provider). */
export interface TourEditInitial {
  name: string;
  start_date: string | null;
  end_date: string | null;
  currency: string | null;
  continent: string | null;
  artist_id: string | null;
  artist_name: string | null;
}

export interface TourEditorModalProps {
  open: boolean;
  mode: 'create' | 'edit';
  onClose: () => void;
  /** Fired with the created/updated tour so callers can refresh + navigate. */
  onSaved?: (tour: { id: string; name: string }) => void;
  /** Create: the workspace artists for the picker. */
  artists?: TourArtistOption[];
  /** Create: pre-selected artist (from context). */
  initialArtistId?: string | null;
  /** Edit: the tour id + its current values. */
  tourId?: string;
  editInitial?: TourEditInitial | null;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function dateRangeIso(start: string, end: string): string[] {
  const out: string[] = [];
  if (!start || !end) return out;
  const s = new Date(`${start}T12:00:00Z`);
  const e = new Date(`${end}T12:00:00Z`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return out;
  while (s <= e) {
    out.push(s.toISOString().slice(0, 10));
    s.setUTCDate(s.getUTCDate() + 1);
    if (out.length > 365) break;
  }
  return out;
}
function addOneDayIso(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
function isRowFilled(r: RoutingRow): boolean {
  return !!((r.day_type && r.day_type.trim()) || (r.venue_name && r.venue_name.trim()) || (r.city && r.city.trim()) || (r.address && r.address.trim()));
}
function seedRows(start: string, end: string): RoutingRow[] {
  return dateRangeIso(start, end).map((date) => ({ date, day_type: '', city: '', country: '', address: '', venue_name: '', notes: '', transport_to_next: 'default' }));
}

export function TourEditorModal(props: TourEditorModalProps) {
  // Remount on open / mode / tour switch so all local state resets cleanly.
  return <TourEditorModalInner key={`${props.mode}:${props.tourId ?? 'new'}:${props.open ? 'o' : 'c'}`} {...props} />;
}

function TourEditorModalInner({
  open,
  mode,
  onClose,
  onSaved,
  artists = [],
  initialArtistId = null,
  tourId,
  editInitial = null,
}: TourEditorModalProps) {
  const { showToast } = useToast();
  const isEdit = mode === 'edit';
  const today = useMemo(() => todayIso(), []);

  const [tab, setTab] = useState<'details' | 'routing'>('details');

  // Artist — create uses Existing/New; edit is locked to the tour's artist.
  const [artistMode, setArtistMode] = useState<'existing' | 'new'>('existing');
  const [pickedArtistId, setPickedArtistId] = useState<string>(() => initialArtistId ?? artists[0]?.id ?? '');
  const [newArtistName, setNewArtistName] = useState('');

  const [name, setName] = useState(editInitial?.name ?? '');
  const [startDate, setStartDate] = useState(editInitial?.start_date ?? today);
  const [endDate, setEndDate] = useState(editInitial?.end_date ?? today);
  const [region, setRegion] = useState(editInitial?.continent ?? 'UK');
  const [currency, setCurrency] = useState(editInitial?.currency ?? DEFAULT_TOUR_CURRENCY);

  const [rows, setRows] = useState<RoutingRow[]>([]);
  const [rowsSeededFor, setRowsSeededFor] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit: load existing routing when the Routing tab is first opened. A ref (not
  // state) is the one-way "loaded" guard — no re-render + no setState-in-effect.
  const routingLoadedRef = useRef(false);
  useEffect(() => {
    if (!isEdit || !tourId || tab !== 'routing' || routingLoadedRef.current) return;
    routingLoadedRef.current = true;
    fetch(`/api/tours/${tourId}/routing`)
      .then((r) => (r.ok ? r.json() : { dates: [] }))
      .then((j: { dates?: RoutingRow[] }) => {
        const existing = j.dates ?? [];
        setRows(existing.length ? existing : seedRows(startDate, endDate));
      })
      .catch(() => setRows(seedRows(startDate, endDate)));
  }, [isEdit, tourId, tab, startDate, endDate]);

  const datesValid = !!startDate && !!endDate && startDate <= endDate;
  const effectiveArtistId = isEdit ? editInitial?.artist_id ?? null : artistMode === 'existing' ? pickedArtistId || null : null;
  const trimmedName = name.trim();
  const canSave = !!trimmedName && datesValid && (isEdit || !!effectiveArtistId || (artistMode === 'new' && !!newArtistName.trim())) && !submitting;

  const filledRowCount = useMemo(() => rows.filter(isRowFilled).length, [rows]);

  const updateRow = useCallback((index: number, updates: Partial<RoutingRow>) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...updates } : r)));
  }, []);
  const onDeleteRow = useCallback((index: number) => setRows((prev) => prev.filter((_, i) => i !== index)), []);
  const onAddRow = useCallback(() => {
    setRows((prev) => {
      const last = prev[prev.length - 1];
      const nextDate = last?.date ? addOneDayIso(last.date) : today;
      return [...prev, { date: nextDate, day_type: '', city: '', country: '', address: '', venue_name: '', notes: '', transport_to_next: 'default' }];
    });
  }, [today]);

  // Seed routing rows on entering the Routing tab (create), for this date range.
  const goRouting = useCallback(() => {
    if (!isEdit) {
      const key = `${startDate}__${endDate}`;
      if (rowsSeededFor !== key) {
        setRows(seedRows(startDate, endDate));
        setRowsSeededFor(key);
      }
    }
    setTab('routing');
  }, [isEdit, startDate, endDate, rowsSeededFor]);

  const persistRouting = useCallback(async (id: string, includeRows: boolean) => {
    if (!includeRows) return;
    const filled = rows.filter(isRowFilled);
    if (!filled.length) return;
    try {
      await fetch(`/api/tours/${id}/routing`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dates: filled }),
      });
    } catch {
      showToast('Saved, but routing failed — open Routing to retry.');
    }
  }, [rows, showToast]);

  const save = useCallback(async (includeRouting: boolean) => {
    if (!canSave) return;
    setSubmitting(true);
    setError(null);
    try {
      if (isEdit && tourId) {
        const res = await fetch(`/api/tours/${tourId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: trimmedName, currency, continent: region, start_date: startDate, end_date: endDate }),
        });
        if (!res.ok) { setError((await res.json().catch(() => null))?.error ?? `Save failed (${res.status})`); setSubmitting(false); return; }
        await persistRouting(tourId, includeRouting && routingLoadedRef.current);
        showToast('Tour updated');
        onSaved?.({ id: tourId, name: trimmedName });
        onClose();
        return;
      }
      // Create — resolve the artist first if a new name was entered.
      let artistId = effectiveArtistId;
      if (!isEdit && artistMode === 'new') {
        const aRes = await fetch('/api/artists', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newArtistName.trim() }) });
        const aBody = (await aRes.json().catch(() => null)) as { id?: string; error?: string } | null;
        if (!aRes.ok || !aBody?.id) { setError(aBody?.error ?? 'Could not create the artist'); setSubmitting(false); return; }
        artistId = aBody.id;
      }
      if (!artistId) { setError('Pick or name an artist.'); setSubmitting(false); return; }
      const res = await fetch('/api/tours', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artist_id: artistId, name: trimmedName, start_date: startDate, end_date: endDate, currency, continent: region }),
      });
      const body = (await res.json().catch(() => null)) as { id?: string; name?: string; error?: string } | null;
      if (!res.ok || !body?.id) { setError(body?.error ?? `Create failed (${res.status})`); setSubmitting(false); return; }
      await persistRouting(body.id, includeRouting);
      showToast('Tour created');
      onSaved?.({ id: body.id, name: body.name ?? trimmedName });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      setSubmitting(false);
    }
  }, [canSave, isEdit, tourId, trimmedName, currency, region, startDate, endDate, persistRouting, effectiveArtistId, artistMode, newArtistName, showToast, onSaved, onClose]);

  const footer = (
    <div className="flex w-full items-center justify-between gap-2">
      <div>
        {tab === 'routing' ? (
          <button type="button" onClick={() => setTab('details')} className="btn-transition" style={btnGhost}>← Details</button>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        {!isEdit ? (
          <button type="button" onClick={() => void save(false)} disabled={!canSave} className="btn-transition" style={btnGhost}>
            {submitting ? 'Creating…' : 'Skip routing & create'}
          </button>
        ) : null}
        {tab === 'details' && !isEdit ? (
          <button type="button" onClick={goRouting} disabled={!canSave} className="btn-transition" style={btnPrimary(canSave)}>Next: routing →</button>
        ) : (
          <button type="button" onClick={() => void save(true)} disabled={!canSave} className="btn-transition" style={btnPrimary(canSave)}>
            {submitting ? 'Saving…' : isEdit ? 'Save changes' : filledRowCount > 0 ? `Create tour · ${filledRowCount} ${filledRowCount === 1 ? 'day' : 'days'}` : 'Create tour'}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit tour' : 'New tour'} subtitle={isEdit ? 'Update the tour’s details and routing.' : 'Set up the tour, then lay out the routing.'} size="xl" footer={footer} closeOnBackdrop={false}>
      {/* Tabs */}
      <div className="mb-4 flex items-center gap-4 border-b" style={{ borderColor: 'var(--lp-border)' }}>
        {(['details', 'routing'] as const).map((t) => {
          const on = tab === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => (t === 'routing' && !isEdit ? goRouting() : setTab(t))}
              className="btn-transition -mb-px border-b-2 px-1 pb-2 text-sm"
              style={{ borderColor: on ? 'var(--lp-orange)' : 'transparent', color: on ? 'var(--lp-text)' : 'var(--lp-text-tertiary)', fontWeight: on ? 700 : 500 }}
            >
              {t === 'details' ? 'Details' : 'Routing'}
            </button>
          );
        })}
      </div>

      {error ? (
        <div role="alert" className="mb-3 rounded-md px-3 py-2 text-sm" style={{ color: 'var(--color-lp-error)', background: 'color-mix(in srgb, var(--color-lp-error) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-lp-error) 30%, transparent)' }}>{error}</div>
      ) : null}

      {tab === 'details' ? (
        <div className="flex flex-col gap-4">
          {/* Artist */}
          <label style={labelStyle}>Artist</label>
          {isEdit ? (
            <div style={{ ...inputStyle, color: 'var(--lp-text-secondary)', background: 'var(--lp-panel)' }}>{editInitial?.artist_name ?? '—'}</div>
          ) : (
            <>
              <div className="inline-flex w-fit rounded-md border p-0.5" style={{ borderColor: 'var(--lp-border)' }}>
                {(['existing', 'new'] as const).map((m) => {
                  const on = artistMode === m;
                  return (
                    <button key={m} type="button" onClick={() => setArtistMode(m)} className="btn-transition rounded px-3 py-1 text-sm"
                      style={{ background: on ? 'var(--lp-surface-hover)' : 'transparent', color: on ? 'var(--lp-text)' : 'var(--lp-text-secondary)', fontWeight: on ? 600 : 500, boxShadow: on ? 'var(--lp-shadow-sm)' : 'none' }}>
                      {m === 'existing' ? 'Existing' : 'New'}
                    </button>
                  );
                })}
              </div>
              {artistMode === 'existing' ? (
                <select value={pickedArtistId} onChange={(e) => setPickedArtistId(e.target.value)} disabled={artists.length === 0} style={inputStyle}>
                  {artists.length === 0 ? <option value="">No artists yet — create one</option> : artists.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              ) : (
                <input type="text" value={newArtistName} onChange={(e) => setNewArtistName(e.target.value)} placeholder="New artist name" style={inputStyle} />
              )}
            </>
          )}

          <div>
            <label style={labelStyle}>Tour name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. World Tour 2026" autoFocus style={inputStyle} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><label style={labelStyle}>Start date</label><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} /></div>
            <div><label style={labelStyle}>End date</label><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} /></div>
          </div>
          {!datesValid && startDate && endDate ? (
            <div className="text-xs" style={{ color: 'var(--color-lp-error)' }}>End date must be on or after start date.</div>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={labelStyle}>Region</label>
              <select value={region} onChange={(e) => setRegion(e.target.value)} style={inputStyle}>
                {REGION_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Currency</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} style={inputStyle}>
                {TOUR_CURRENCIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm" style={{ color: 'var(--lp-text-secondary)' }}>
            One row per date. Search the venue library or create a new venue — City, Country and Address auto-fill.
            {' '}<span className="lp-mono" style={{ color: 'var(--lp-text)' }}>{filledRowCount}</span> of <span className="lp-mono">{rows.length}</span> filled.
          </p>
          <RoutingGrid rows={rows} onChange={setRows} updateRow={updateRow} onDeleteRow={onDeleteRow} primaryTransit="bus_van" compact />
          <button type="button" onClick={onAddRow} className="btn-transition inline-flex w-fit items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm" style={{ borderColor: 'var(--lp-border-strong)', color: 'var(--lp-text-secondary)', background: 'var(--lp-panel)' }}>
            <Plus size={14} /> Add row
          </button>
        </div>
      )}
    </Modal>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: 'var(--lp-space-2) var(--lp-space-3)', fontSize: 'var(--lp-text-sm)',
  color: 'var(--lp-text)', background: 'var(--lp-bg)', border: '1px solid var(--lp-border)',
  borderRadius: 'var(--lp-radius-md)', outline: 'none',
};
const labelStyle: React.CSSProperties = {
  display: 'block', marginBottom: 'var(--lp-space-1)', fontSize: 13, color: 'var(--lp-text-secondary)',
};
const btnGhost: React.CSSProperties = {
  padding: 'var(--lp-space-2) var(--lp-space-4)', fontSize: 'var(--lp-text-sm)', fontWeight: 'var(--lp-weight-medium)',
  color: 'var(--lp-text-secondary)', background: 'transparent', border: '1px solid var(--lp-border-strong)',
  borderRadius: 'var(--lp-radius-md)', cursor: 'pointer',
};
function btnPrimary(enabled: boolean): React.CSSProperties {
  return {
    padding: 'var(--lp-space-2) var(--lp-space-4)', fontSize: 'var(--lp-text-sm)', fontWeight: 'var(--lp-weight-semibold)',
    color: enabled ? 'var(--lp-text-inverse)' : 'var(--lp-text-tertiary)',
    background: enabled ? 'var(--color-lp-orange)' : 'var(--lp-surface-hover)',
    border: '1px solid transparent', borderRadius: 'var(--lp-radius-md)', cursor: enabled ? 'pointer' : 'not-allowed', opacity: enabled ? 1 : 0.7,
  };
}

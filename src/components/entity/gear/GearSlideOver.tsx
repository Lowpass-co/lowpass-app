'use client';

/* ============================================
   LOWPASS — a stock item (Nov 2026 rebuild, Adam: "this pop out also sucks")

   One panel to ADD an item (id = null) or EDIT one. Labelled fields, the
   photo at the top (upload, drop, or from a link), "Look it up" online
   (retail value, basic info, weight, photo — /api/gear/lookup; it only
   fills BLANK fields), status as one tap, tours by name, no ids.

   Edit = hybrid save (CLAUDE.md "Multi-field slide-overs"):
     safe fields   → useAutoSave (name, make, model, category, serial, owned,
                     purchase cost, day rate, value, weight, size, status,
                     notes, owner label) — Cancel restores the snapshot.
     ownership     → its own save with a confirm (owned → unlinks derived
                     budget hire rows on linked tours).
     photo         → saved the moment it's set.
     delete        → only an item never on a job or tour (409 → Retire).
   Add = one explicit "Add to stock".
   ============================================ */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ImagePlus, Link2, Loader2, Search, Sparkles, Trash2 } from 'lucide-react';
import { SlideOver } from '@/components/ui/SlideOver';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { SaveStatus } from '@/components/forms/SaveStatus';
import { NumInput, BOX_CLASS } from '@/components/income/moneyUi';
import { useAutoSave } from '@/lib/forms/useAutoSave';
import { getGearById, updateGear } from '@/lib/api/gear';
import { createClient } from '@/lib/supabase-client';
import { uploadDirect } from '@/lib/uploads/directUpload';
import { dayRateFromPurchase } from '@/lib/rental-pricing';
import { CATEGORIES, fmtMoney } from '@/components/equipment/types';
import type { GearLookup } from '@/lib/gear/lookup';
import type { Gear, GearOwnership, TourGear } from '@/lib/types/gear';
import { StatusPill, STOCK_STATUS_TONE } from '@/components/equipment/StatusPill';

type GearWithTours = Gear & { tourGear?: TourGear[] };
type Status = NonNullable<Gear['status']>;

const STATUSES: Array<{ value: Status; label: string }> = [
  { value: 'available', label: 'Available' },
  { value: 'in_use', label: 'In use' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'retired', label: 'Retired' },
];

/** Everything the panel edits, in one shape (autosave's T). */
export interface Draft {
  name: string;
  manufacturer: string;
  model: string;
  category: string;
  serial: string;
  quantity: number;
  purchaseCost: number | null;
  /** null = 3% of the purchase cost. */
  dayRate: number | null;
  valueAmount: number | null;
  valueCurrency: string;
  weightKg: number | null;
  dims: { l: number | null; w: number | null; h: number | null };
  status: Status;
  notes: string;
  ownerLabel: string;
}

export const EMPTY: Draft = {
  name: '', manufacturer: '', model: '', category: '', serial: '', quantity: 1,
  purchaseCost: null, dayRate: null, valueAmount: null, valueCurrency: 'USD', weightKg: null,
  dims: { l: null, w: null, h: null }, status: 'available', notes: '', ownerLabel: '',
};

function fromGear(g: GearWithTours): Draft {
  const d = g.dimensionsCm ?? {};
  return {
    name: g.name ?? '',
    manufacturer: g.manufacturer ?? '',
    model: g.model ?? '',
    category: g.category ?? '',
    serial: g.serialNumber ?? '',
    quantity: g.quantity ?? 1,
    purchaseCost: g.purchaseCost ?? null,
    dayRate: g.dayRateManual ? g.dayRate ?? null : null,
    valueAmount: g.valueAmount ?? null,
    valueCurrency: (g.valueCurrency || 'USD').toUpperCase(),
    weightKg: g.weightKg ?? null,
    dims: { l: d.l ?? null, w: d.w ?? null, h: d.h ?? null },
    status: g.status ?? 'available',
    notes: g.notes ?? '',
    ownerLabel: g.ownerLabel ?? '',
  };
}

/** The PATCH / POST body for a draft. */
export function toBody(d: Draft): Record<string, unknown> {
  const dims = d.dims.l && d.dims.w && d.dims.h ? { l: d.dims.l, w: d.dims.w, h: d.dims.h } : {};
  return {
    name: d.name.trim(),
    manufacturer: d.manufacturer.trim() || null,
    model: d.model.trim() || null,
    category: d.category.trim() || null,
    serial_number: d.serial.trim() || null,
    quantity: Math.max(1, Math.round(d.quantity) || 1),
    purchase_cost: d.purchaseCost,
    day_rate: d.dayRate,
    day_rate_manual: d.dayRate != null,
    value_amount: d.valueAmount,
    value_currency: d.valueAmount != null ? d.valueCurrency : null,
    weight_kg: d.weightKg,
    dimensions_cm: dims,
    status: d.status,
    notes: d.notes.trim() || null,
    owner_label: d.ownerLabel.trim() || null,
  };
}

/** Fill only what's blank — a lookup never overwrites what you typed. */
export function fillBlanks(d: Draft, r: GearLookup): Draft {
  return {
    ...d,
    name: d.name.trim() ? d.name : r.name,
    manufacturer: d.manufacturer || r.manufacturer || '',
    model: d.model || r.model || '',
    category: d.category || r.category || '',
    valueAmount: d.valueAmount ?? r.retail?.amount ?? null,
    valueCurrency: d.valueAmount != null ? d.valueCurrency : r.retail?.currency ?? d.valueCurrency,
    // Stock is priced in USD: a USD retail price is a fair purchase cost to
    // start from (change it to what you paid).
    purchaseCost: d.purchaseCost ?? (r.retail?.currency === 'USD' ? r.retail.amount : null),
    weightKg: d.weightKg ?? r.weightKg,
    dims: d.dims.l ? d.dims : { l: r.dimensionsCm?.l ?? null, w: r.dimensionsCm?.w ?? null, h: r.dimensionsCm?.h ?? null },
    notes: d.notes || r.description || '',
  };
}

export default function GearSlideOver({
  id,
  onClose,
  onCreated,
  onChanged,
  initialQuery,
}: {
  /** null = add a new item. */
  id: string | null;
  /** Add mode: what was typed where the item wasn't found (the job's Add
   *  gear) — it starts the name and the lookup. */
  initialQuery?: string;
  onClose: () => void;
  onCreated?: (id: string) => void;
  /** Something about the item changed (refresh lists). */
  onChanged?: () => void;
}) {
  const [gear, setGear] = useState<GearWithTours | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getGearById(id).then(
      (row) => { if (!cancelled) { if (row) setGear(row); else setLoadError('This item isn’t there any more.'); } },
      (e) => { if (!cancelled) setLoadError((e as Error).message); },
    );
    return () => { cancelled = true; };
  }, [id]);

  if (id && !gear) {
    return (
      <SlideOver open onClose={onClose} title="Item" width="wide" backdrop>
        {loadError ? (
          <p className="text-sm" style={{ color: 'var(--color-lp-error)' }}>{loadError}</p>
        ) : (
          <div className="flex items-center gap-2 text-sm text-lp-text-secondary"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        )}
      </SlideOver>
    );
  }
  return id && gear ? (
    <EditItem key={gear.id} gear={gear} onClose={onClose} onChanged={onChanged} />
  ) : (
    <NewItem onClose={onClose} onCreated={onCreated} initialQuery={initialQuery} />
  );
}

/* ─────────────────────────── add ─────────────────────────── */

function NewItem({ onClose, onCreated, initialQuery }: { onClose: () => void; onCreated?: (id: string) => void; initialQuery?: string }) {
  const { showToast } = useToast();
  const start = initialQuery?.trim() ?? '';
  const [d, setD] = useState<Draft>({ ...EMPTY, name: start });
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!d.name.trim()) {
      showToast('Give it a name first.', 'error');
      return;
    }
    setBusy(true);
    const res = await fetch('/api/gear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...toBody(d), image_url: imageUrl, ownership: 'owned' }),
    });
    const j = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
    setBusy(false);
    if (!res.ok || !j.id) {
      showToast('Couldn’t add it: ' + (j.error ?? res.status), 'error');
      return;
    }
    showToast(`${d.name.trim()} added to stock`, 'success');
    onCreated?.(j.id);
  }

  return (
    <SlideOver
      open
      onClose={onClose}
      title={d.name.trim() || 'New item'}
      subtitle={<Facts d={d} />}
      width="wide"
      backdrop
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" loading={busy} onClick={() => void add()} data-submit>Add to stock</Button>
        </div>
      }
    >
      <Form
        d={d}
        set={(fn) => setD(fn)}
        imageUrl={imageUrl}
        onImage={setImageUrl}
        lookupFirst
        lookupQuery={start}
        provisionalName={start}
      />
    </SlideOver>
  );
}

/* ─────────────────────────── edit ─────────────────────────── */

function EditItem({ gear, onClose, onChanged }: { gear: GearWithTours; onClose: () => void; onChanged?: () => void }) {
  const { showToast } = useToast();
  const [current, setCurrent] = useState(gear);
  const [ownership, setOwnership] = useState<GearOwnership>(gear.ownership ?? 'owned');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [inUse, setInUse] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const dirty = useRef(false);

  const auto = useAutoSave<Draft>({
    initialState: fromGear(gear),
    onSave: async (state) => {
      if (!state.name.trim()) throw new Error('An item needs a name.');
      const saved = (await updateGear(gear.id, toBody(state))) as GearWithTours;
      setCurrent((c) => ({ ...c, ...saved, tourGear: c.tourGear }));
      dirty.current = true;
    },
  });

  const close = useCallback(async () => {
    await auto.flushSave();
    if (dirty.current) onChanged?.();
    onClose();
  }, [auto, onChanged, onClose]);

  async function saveImage(url: string | null) {
    try {
      const saved = (await updateGear(gear.id, { image_url: url })) as GearWithTours;
      setCurrent((c) => ({ ...c, imageUrl: saved.imageUrl }));
      dirty.current = true;
    } catch (e) {
      showToast('Couldn’t save the photo: ' + (e as Error).message, 'error');
    }
  }

  async function changeOwnership(next: GearOwnership) {
    if (next === ownership) return;
    if (next === 'owned' && (current.tourGear ?? []).length > 0) {
      if (!window.confirm('Mark it owned? Its hire lines on linked tours’ budgets come off.')) return;
    }
    const before = ownership;
    setOwnership(next);
    try {
      await updateGear(gear.id, { ownership: next, sync_tour_ids: (current.tourGear ?? []).map((t) => t.tourId) });
      dirty.current = true;
    } catch (e) {
      setOwnership(before);
      showToast('Couldn’t change ownership: ' + (e as Error).message, 'error');
    }
  }

  async function remove() {
    setDeleting(true);
    const res = await fetch(`/api/gear/${gear.id}`, { method: 'DELETE' });
    setDeleting(false);
    if (res.status === 204) {
      showToast(`${current.name} deleted`, 'success');
      onChanged?.();
      onClose();
      return;
    }
    const j = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
    if (j.code === 'IN_USE') {
      setInUse(j.error ?? 'It’s been on a job, so it can’t be deleted — retire it instead.');
      setConfirmDelete(false);
      return;
    }
    showToast('Couldn’t delete it: ' + (j.error ?? res.status), 'error');
  }

  return (
    <SlideOver
      open
      onClose={() => void close()}
      title={auto.state.name.trim() || 'Item'}
      subtitle={<Facts d={auto.state} />}
      headerActions={<StatusPill tone={STOCK_STATUS_TONE[auto.state.status] ?? 'neutral'}>{STATUSES.find((s) => s.value === auto.state.status)?.label}</StatusPill>}
      width="wide"
      backdrop
      footer={
        <div className="flex items-center gap-2">
          {confirmDelete ? (
            <span className="flex items-center gap-2 text-sm">
              <span className="text-lp-text-secondary">Delete for good?</span>
              <Button variant="danger" size="sm" loading={deleting} onClick={() => void remove()}>Delete</Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Keep</Button>
            </span>
          ) : (
            <Button variant="ghost" size="sm" leadingIcon={<Trash2 size={14} aria-hidden />} onClick={() => setConfirmDelete(true)}>Delete</Button>
          )}
          <span className="ml-auto" />
          <SaveStatus status={auto.status} lastSavedAt={auto.lastSavedAt} errorMessage={auto.errorMessage} onRetry={() => void auto.flushSave()} />
          <Button variant="ghost" size="sm" onClick={async () => { await auto.cancel(); onClose(); }}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={() => void close()}>Done</Button>
        </div>
      }
    >
      {inUse ? (
        <div className="mb-5 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--lp-border)', backgroundColor: 'color-mix(in srgb, var(--color-lp-warning) 10%, transparent)' }}>
          <span className="min-w-0 flex-1 text-lp-text">{inUse}</span>
          {auto.state.status !== 'retired' ? (
            <Button size="sm" variant="secondary" onClick={() => { auto.set((s) => ({ ...s, status: 'retired' })); setInUse(null); }}>Retire it</Button>
          ) : null}
        </div>
      ) : null}
      <Form
        d={auto.state}
        set={(fn) => auto.set(fn)}
        imageUrl={current.imageUrl}
        onImage={(url) => void saveImage(url)}
        ownership={ownership}
        onOwnership={(o) => void changeOwnership(o)}
        tours={current.tourGear ?? []}
      />
    </SlideOver>
  );
}

/* ─────────────────────────── the form ─────────────────────────── */

function Facts({ d }: { d: Draft }) {
  const bits = [d.category, [d.manufacturer, d.model].filter(Boolean).join(' '), d.quantity > 1 ? `${d.quantity} owned` : null].filter(Boolean);
  return bits.length ? <span className="text-sm text-lp-text-secondary">{bits.join(' · ')}</span> : null;
}

function Form({
  d,
  set,
  imageUrl,
  onImage,
  lookupFirst,
  lookupQuery,
  provisionalName,
  ownership,
  onOwnership,
  tours,
}: {
  d: Draft;
  set: (fn: (prev: Draft) => Draft) => void;
  imageUrl: string | null;
  onImage: (url: string | null) => void;
  lookupFirst?: boolean;
  /** Starts the lookup box. */
  lookupQuery?: string;
  /** A name nobody has edited yet (what was searched for): the lookup's
   *  proper name replaces it. Anything typed over it is kept. */
  provisionalName?: string;
  ownership?: GearOwnership;
  onOwnership?: (o: GearOwnership) => void;
  tours?: TourGear[];
}) {
  const field = <K extends keyof Draft>(k: K) => (v: Draft[K]) => set((p) => ({ ...p, [k]: v }));
  const autoRate = d.purchaseCost ? dayRateFromPurchase(d.purchaseCost) : null;

  return (
    <div className="space-y-7">
      <div className="grid grid-cols-[132px_minmax(0,1fr)] gap-5">
        <PhotoBox url={imageUrl} onChange={onImage} />
        <Lookup
          initial={lookupFirst ? lookupQuery ?? '' : [d.manufacturer, d.model].filter(Boolean).join(' ') || d.name}
          prominent={!!lookupFirst}
          onResult={(r) => {
            set((p) => fillBlanks(provisionalName && p.name === provisionalName ? { ...p, name: '' } : p, r));
            if (!imageUrl && r.imageUrl) onImage(r.imageUrl);
          }}
        />
      </div>

      <Section title="Details">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Field label="Name" wide>
            <input className={BOX_CLASS} value={d.name} onChange={(e) => field('name')(e.target.value)} placeholder="AKG C414 XLII" autoFocus={!lookupFirst && !d.name} />
          </Field>
          <Field label="Manufacturer">
            <input className={BOX_CLASS} value={d.manufacturer} onChange={(e) => field('manufacturer')(e.target.value)} placeholder="AKG" />
          </Field>
          <Field label="Model">
            <input className={BOX_CLASS} value={d.model} onChange={(e) => field('model')(e.target.value)} placeholder="C414 XLII" />
          </Field>
          <Field label="Category">
            <input className={BOX_CLASS} list="lp-gear-categories" value={d.category} onChange={(e) => field('category')(e.target.value)} placeholder="Audio" />
            <datalist id="lp-gear-categories">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
          <Field label="Serial number">
            <input className={BOX_CLASS} value={d.serial} onChange={(e) => field('serial')(e.target.value)} placeholder="—" />
          </Field>
        </div>
      </Section>

      <Section title="Status">
        <div className="grid grid-cols-4 gap-1 rounded-lg p-1" style={{ backgroundColor: 'var(--lp-bg-secondary)' }} role="radiogroup" aria-label="Status">
          {STATUSES.map((s) => {
            const on = d.status === s.value;
            return (
              <button
                key={s.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => field('status')(s.value)}
                className="rounded-md py-1.5 text-sm transition-colors"
                style={{
                  backgroundColor: on ? 'var(--lp-surface)' : 'transparent',
                  color: on ? 'var(--lp-text)' : 'var(--lp-text-secondary)',
                  boxShadow: on ? 'var(--lp-shadow-sm)' : undefined,
                  fontWeight: on ? 'var(--lp-weight-medium)' : undefined,
                }}
              >
                {s.label}
              </button>
            );
          })}
        </div>
        {d.status === 'retired' ? <p className="mt-2 text-xs text-lp-text-tertiary">Retired items aren’t offered on new jobs. Old quotes keep them.</p> : null}
      </Section>

      <Section title="Rental">
        <div className="grid grid-cols-3 gap-x-4 gap-y-3">
          <Field label="Owned">
            <NumInput ariaLabel="Quantity owned" kind="count" zeroIsBlank={false} value={d.quantity} onCommit={(v) => field('quantity')(Math.max(1, Math.round(v ?? 1)))} />
          </Field>
          <Field label="Purchase cost (USD)">
            <NumInput ariaLabel="Purchase cost" currency="USD" value={d.purchaseCost} onCommit={(v) => field('purchaseCost')(v)} />
          </Field>
          <Field label="Day rate (USD)">
            <NumInput
              ariaLabel="Day rate"
              currency="USD"
              value={d.dayRate}
              placeholder={autoRate != null ? `${fmtMoney(autoRate, 'USD')} · 3%` : '—'}
              onCommit={(v) => field('dayRate')(v)}
            />
          </Field>
        </div>
        <p className="mt-2 text-xs text-lp-text-tertiary">Leave the day rate blank to charge 3% of the purchase cost.</p>
      </Section>

      <Section title="Physical">
        <div className="grid grid-cols-3 gap-x-4 gap-y-3">
          <Field label={`Retail value${d.valueCurrency ? ` (${d.valueCurrency})` : ''}`}>
            <NumInput ariaLabel="Retail value" currency={d.valueCurrency || 'USD'} value={d.valueAmount} onCommit={(v) => field('valueAmount')(v)} />
          </Field>
          <Field label="Weight (kg)">
            <NumInput ariaLabel="Weight in kg" kind="count" value={d.weightKg} onCommit={(v) => field('weightKg')(v)} />
          </Field>
          <Field label="Size L × W × H (cm)">
            <div className="grid grid-cols-3 gap-1">
              {(['l', 'w', 'h'] as const).map((k) => (
                <NumInput key={k} ariaLabel={`${k.toUpperCase()} in cm`} kind="count" value={d.dims[k]} onCommit={(v) => set((p) => ({ ...p, dims: { ...p.dims, [k]: v } }))} />
              ))}
            </div>
          </Field>
        </div>
      </Section>

      {onOwnership && ownership ? (
        <Section title="Ownership">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Field label="Who owns it">
              <select className={`lp-select ${BOX_CLASS}`} value={ownership} onChange={(e) => onOwnership(e.target.value as GearOwnership)}>
                <option value="owned">Owned</option>
                <option value="sub_hired">Sub-hired in</option>
                <option value="hired_to_client">Hired out</option>
              </select>
            </Field>
            {ownership !== 'owned' ? (
              <Field label="From / to">
                <input className={BOX_CLASS} value={d.ownerLabel} onChange={(e) => field('ownerLabel')(e.target.value)} placeholder="Company" />
              </Field>
            ) : null}
          </div>
        </Section>
      ) : null}

      {tours && tours.length > 0 ? <ToursList tours={tours} /> : null}

      <Section title="Notes">
        <textarea
          className={`${BOX_CLASS} h-auto py-2`}
          rows={3}
          value={d.notes}
          onChange={(e) => field('notes')(e.target.value)}
          placeholder="Anything the crew should know"
          style={{ resize: 'vertical' }}
        />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2.5 text-sm font-medium text-lp-text">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <label className={`flex min-w-0 flex-col gap-1 ${wide ? 'col-span-2' : ''}`}>
      <span className="text-xs text-lp-text-tertiary">{label}</span>
      {children}
    </label>
  );
}

/** Tours this item is on — by name, read-only (the tour Gear page is going). */
function ToursList({ tours }: { tours: TourGear[] }) {
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    const ids = [...new Set(tours.map((t) => t.tourId))];
    void createClient()
      .from('tours')
      .select('id, name')
      .in('id', ids)
      .then(({ data }) => {
        if (cancelled || !data) return;
        setNames(Object.fromEntries((data as Array<{ id: string; name: string }>).map((t) => [t.id, t.name])));
      });
    return () => { cancelled = true; };
  }, [tours]);
  return (
    <Section title="On tours">
      <ul className="divide-y rounded-lg border text-sm" style={{ borderColor: 'var(--lp-border)' }}>
        {tours.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2" style={{ borderColor: 'var(--lp-border)' }}>
            <span className="truncate text-lp-text">{names[t.tourId] ?? 'A tour'}</span>
            <span className="shrink-0 text-lp-text-tertiary">× {t.quantity}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/* ─────────────────────────── photo ─────────────────────────── */

async function uploadPhoto(file: File): Promise<string> {
  const type = file.type;
  const grantRes = await fetch('/api/gear/photos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'upload-url', type, size: file.size }),
  });
  const grant = (await grantRes.json().catch(() => ({}))) as { bucket?: string; path?: string; token?: string; error?: string };
  if (!grantRes.ok || !grant.path || !grant.token || !grant.bucket) throw new Error(grant.error ?? 'Couldn’t start the upload.');
  await uploadDirect({ bucket: grant.bucket, path: grant.path, token: grant.token }, file);
  const doneRes = await fetch('/api/gear/photos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'complete', path: grant.path }),
  });
  const done = (await doneRes.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!doneRes.ok || !done.url) throw new Error(done.error ?? 'The upload didn’t finish.');
  return done.url;
}

function PhotoBox({ url, onChange }: { url: string | null; onChange: (url: string | null) => void }) {
  const { showToast } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState('');
  const [over, setOver] = useState(false);

  async function take(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      onChange(await uploadPhoto(file));
    } catch (e) {
      showToast((e as Error).message, 'error');
    }
    setBusy(false);
  }

  async function fromLink() {
    if (!link.trim()) return;
    setBusy(true);
    const res = await fetch('/api/gear/photos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'from-link', url: link.trim() }),
    });
    const j = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    setBusy(false);
    if (!res.ok || !j.url) {
      showToast(j.error ?? 'Couldn’t get a photo from that link.', 'error');
      return;
    }
    onChange(j.url);
    setLink('');
    setLinkOpen(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); void take(e.dataTransfer.files?.[0]); }}
        aria-label={url ? 'Change the photo' : 'Add a photo'}
        className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border transition-colors"
        style={{
          borderColor: over ? 'var(--lp-orange)' : 'var(--lp-border)',
          borderStyle: url ? 'solid' : 'dashed',
          backgroundColor: 'var(--lp-bg-secondary)',
        }}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="h-full w-full object-contain" style={{ backgroundColor: 'var(--lp-surface)' }} />
        ) : (
          <span className="flex flex-col items-center gap-1.5 text-xs text-lp-text-tertiary">
            <ImagePlus size={20} aria-hidden />
            Add photo
          </span>
        )}
        {busy ? (
          <span className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: 'color-mix(in srgb, var(--lp-surface) 70%, transparent)' }}>
            <Loader2 className="h-5 w-5 animate-spin text-lp-text-secondary" />
          </span>
        ) : null}
      </button>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(e) => void take(e.target.files?.[0])} />
      {linkOpen ? (
        <div className="flex gap-1" data-submit-scope>
          <input
            className={`${BOX_CLASS} h-8 text-xs`}
            value={link}
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void fromLink(); } }}
            placeholder="Paste a link"
            autoFocus
          />
        </div>
      ) : (
        <div className="flex justify-center gap-3 text-xs">
          <button type="button" className="inline-flex items-center gap-1 text-lp-text-secondary hover:text-lp-text" onClick={() => setLinkOpen(true)}>
            <Link2 size={12} aria-hidden /> Link
          </button>
          {url ? (
            <button type="button" className="text-lp-text-secondary hover:text-[var(--color-lp-error)]" onClick={() => onChange(null)}>Remove</button>
          ) : null}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── look it up ─────────────────────────── */

function Lookup({ initial, prominent, onResult }: { initial: string; prominent: boolean; onResult: (r: GearLookup) => void }) {
  const [q, setQ] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sources, setSources] = useState<string[]>([]);

  async function run() {
    if (q.trim().length < 2 || busy) return;
    setBusy(true);
    setError(null);
    const res = await fetch('/api/gear/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q.trim() }),
    });
    const j = (await res.json().catch(() => ({}))) as { result?: GearLookup; error?: string };
    setBusy(false);
    if (!res.ok || !j.result) {
      setError(j.error ?? 'The lookup didn’t work just now.');
      return;
    }
    setSources(j.result.sources);
    onResult(j.result);
  }

  const hosts = [...new Set(sources.map((s) => { try { return new URL(s).hostname.replace(/^www\./, ''); } catch { return null; } }).filter(Boolean))] as string[];

  return (
    <div
      className="flex flex-col justify-center gap-2 rounded-xl border p-4"
      style={{ borderColor: prominent ? 'color-mix(in srgb, var(--lp-orange) 35%, var(--lp-border))' : 'var(--lp-border)', backgroundColor: prominent ? 'color-mix(in srgb, var(--lp-orange) 5%, transparent)' : 'transparent' }}
    >
      <div className="flex items-center gap-2 text-sm font-medium text-lp-text">
        <Sparkles size={15} aria-hidden style={{ color: 'var(--lp-orange)' }} />
        Look it up online
      </div>
      <div className="flex gap-2" data-submit-scope>
        <div className="relative min-w-0 flex-1">
          <Search size={14} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lp-text-tertiary" />
          <input
            className={`${BOX_CLASS} pl-8`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void run(); } }}
            placeholder="Make and model, e.g. AKG C414 XLII"
            aria-label="Look it up online"
            autoFocus={prominent}
          />
        </div>
        <Button variant={prominent ? 'primary' : 'secondary'} size="md" loading={busy} onClick={() => void run()} data-submit>
          {busy ? 'Searching…' : 'Look it up'}
        </Button>
      </div>
      {error ? (
        <p className="text-xs" style={{ color: 'var(--color-lp-error)' }}>{error}</p>
      ) : hosts.length ? (
        <p className="text-xs text-lp-text-tertiary">Filled the blanks from {hosts.slice(0, 3).join(', ')}. Check the numbers before you quote them.</p>
      ) : (
        <p className="text-xs text-lp-text-tertiary">Retail value, weight, size and a photo. Fills only what’s blank.</p>
      )}
    </div>
  );
}


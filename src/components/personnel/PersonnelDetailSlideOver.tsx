'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ExternalLink, FileText, ImageIcon, Loader2, Plus, Trash2, X } from 'lucide-react';
import type { Personnel, PersonnelRates } from '@/types';
import type {
  PersonnelDietaryType,
  PersonnelDietaryV2,
  PersonnelEmergencyContactV2,
  PersonnelExtendedProfile,
  PersonnelFrequentFlierTier,
  PersonnelFrequentFlierV2,
  PersonnelGarment,
  PersonnelMerchSizeV2,
  PersonnelPassportDetail,
  PersonnelPassportV2,
  PersonnelStoredDocument,
  PersonnelVisaV2,
} from '@/lib/personnel-extended-profile';
import {
  legacyPassportInfoFromPrimary,
  liftDietary,
  liftEmergencyContacts,
  liftFrequentFlier,
  liftMerchSizes,
  liftPassportsV2,
  liftVisas,
  parseExtendedProfile,
  passportsFromPerson,
  syncEmergencyContactLegacy,
  syncPassportsLegacy,
} from '@/lib/personnel-extended-profile';
import { cn } from '@/lib/utils';
import { BrandedSelect } from '@/components/ui/BrandedSelect';

export type PersonnelPanelState =
  | null
  | { mode: 'create' }
  /** Optional `scrollToSection` is the data-section id the
   *  slide-over should scroll into view on open. Used by the
   *  CompletenessRing click-through to land the operator on
   *  the first missing section. Sections are tagged with
   *  `data-section="<id>"` matching the ids returned by
   *  computeCompleteness (identity / contact / passports /
   *  emergency / home-airport / dietary / merch-sizes /
   *  frequent-flier / pay). */
  | { mode: 'edit'; id: string; scrollToSection?: string | null };

const IC =
  'w-full rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text outline-none focus:border-lp-orange';
/* Sprint 9 §14.6 — native <select> elements have a different
   intrinsic height than text <input>s under the IC class (the
   browser adds vendor padding for the dropdown arrow). Set an
   explicit height that matches an IC-styled input — `text-sm`
   (14px) + `py-2` (8px top + 8px bottom) + 1px×2 border + the
   line-height of the font ≈ 38px. Applied alongside `IC` so
   selects stay flush in any horizontal grid. */
const SELECT_HEIGHT_PX = 38;
const CUR = ['GBP', 'EUR', 'USD'] as const;

function Section({
  id,
  title,
  defaultOpen = false,
  children,
}: {
  /** Sprint 9 §13.B.2 — stable section id matching the
   *  computeCompleteness output so the CompletenessRing's
   *  click-through can scroll directly here. */
  id: string;
  title: string;
  /** Sprint 9 §13.B.1 spec: PERSONAL + CONTACT open by default,
   *  others collapsed. */
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      data-section={id}
      open={defaultOpen}
      className="group border-b border-lp-border/80 pb-4 last:border-0"
    >
      <summary className="cursor-pointer list-none py-2 text-xs font-bold uppercase tracking-wider text-lp-text-secondary marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-2">
          <span className="text-lp-orange">▸</span>
          {title}
        </span>
      </summary>
      <div className="mt-3 space-y-3 pl-1">{children}</div>
    </details>
  );
}

function L({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <label className={cn('mb-1 block text-[10px] font-semibold uppercase tracking-wide text-lp-text-tertiary', className)}>
      {children}
    </label>
  );
}

/* Sprint 9 §13.D — shared multi-of-each list UI. Renders each
   entry inside a card with a Remove button at the top-right and
   a "+ Add <kind>" button at the bottom. The fields-per-entry
   render is delegated to `renderEntry` so each section's shape
   can stay close to its data definition. */
function MultiList<T>({
  items,
  empty,
  addLabel,
  onAdd,
  onRemove,
  renderEntry,
}: {
  items: T[];
  /** Copy shown when the list is empty. The Add button still
   *  renders below it. */
  empty: string;
  addLabel: string;
  onAdd: () => void;
  onRemove: (index: number) => void;
  renderEntry: (entry: T, index: number) => React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <p className="text-xs italic text-lp-text-tertiary">{empty}</p>
      ) : (
        <ul className="space-y-3" aria-label={`${addLabel} list`}>
          {items.map((item, i) => (
            <li
              key={i}
              className="rounded-lg border border-lp-border/80 bg-lp-surface/30 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">{renderEntry(item, i)}</div>
                <button
                  type="button"
                  onClick={() => onRemove(i)}
                  aria-label="Remove entry"
                  className="shrink-0 rounded-lg border border-red-500/40 p-1.5 text-red-600 hover:bg-red-500/10 dark:text-red-400"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex items-center gap-1 rounded-lg border border-dashed border-lp-border px-3 py-2 text-xs font-medium text-lp-text-secondary hover:border-lp-orange/50 hover:text-lp-text"
      >
        <Plus className="h-3.5 w-3.5" />
        {addLabel}
      </button>
    </div>
  );
}

const DIETARY_TYPES: ReadonlyArray<{ value: PersonnelDietaryType; label: string }> = [
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'gluten_free', label: 'Gluten-free' },
  { value: 'kosher', label: 'Kosher' },
  { value: 'halal', label: 'Halal' },
  { value: 'custom', label: 'Other / custom' },
];

const GARMENTS: ReadonlyArray<{ value: PersonnelGarment; label: string }> = [
  { value: 't_shirt', label: 'T-shirt' },
  { value: 'hoodie', label: 'Hoodie' },
  { value: 'jacket', label: 'Jacket' },
  { value: 'pants', label: 'Pants' },
  { value: 'shoes', label: 'Shoes' },
];

const FLIER_TIERS: ReadonlyArray<{ value: PersonnelFrequentFlierTier; label: string }> = [
  { value: 'basic', label: 'Basic' },
  { value: 'silver', label: 'Silver' },
  { value: 'gold', label: 'Gold' },
  { value: 'platinum', label: 'Platinum' },
];

function PassportFields({
  label,
  p,
  onChange,
}: {
  label: string;
  p: PersonnelPassportDetail;
  onChange: (k: keyof PersonnelPassportDetail, v: string) => void;
}) {
  const row = (k: keyof PersonnelPassportDetail, title: string, type: 'text' | 'date' = 'text') => (
    <div key={String(k)}>
      <L>{title}</L>
      <input type={type} value={p[k] ?? ''} onChange={(e) => onChange(k, e.target.value)} className={IC} />
    </div>
  );
  return (
    <div className="rounded-lg border border-lp-border/80 bg-lp-surface/30 p-3">
      <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-lp-text-tertiary">{label}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {row('number', 'Passport #')}
        {row('type', 'Type')}
        {row('code', 'Code')}
        {row('authority', 'Authority')}
        {row('date_of_birth', 'Date of birth', 'date')}
        {row('place_of_birth', 'Place of birth')}
        {row('valid_from', 'Valid from', 'date')}
        {row('expiry_date', 'Expiry', 'date')}
        {row('empty_pages', 'No. of empty pages')}
        {row('empty_double_pages', 'No. of empty dbl pages')}
        {row('citizenship', 'Citizenship')}
      </div>
    </div>
  );
}

export function PersonnelDetailSlideOver({
  panel,
  viewerCanSeePay = true,
  onClose,
  onSaved,
}: {
  panel: PersonnelPanelState;
  /** Sprint 9 §13.B.2 (Q5) — gate the Pay section. When false,
   *  the section doesn't render and the slide-over doesn't send
   *  pay-related fields back on save. Default true so existing
   *  callers (admin tools, bug reports) keep seeing it; the
   *  /personnel page passes the role-derived value. */
  viewerCanSeePay?: boolean;
  onClose: () => void;
  onSaved: (row: Personnel, meta?: { source?: 'form' | 'document' }) => void;
}) {
  const open = panel !== null;
  const scrollToSection = panel?.mode === 'edit' ? panel.scrollToSection ?? null : null;
  const scrollHostRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Sprint 9 §14.7 — mount-deferred close animation. Mirrors the
     SlideOver primitive's lifecycle so closing the slide-over
     animates out (slide right + fade) instead of disappearing
     instantly. The previous `if (!open) return null` short-
     circuited the exit transition before the browser could
     paint the closed-state styles. */
  const [mounted, setMounted] = useState(open);
  const [animateIn, setAnimateIn] = useState(false);
  const panelAnimRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  useEffect(() => {
    if (open) {
      const r = requestAnimationFrame(() => setAnimateIn(true));
      return () => cancelAnimationFrame(r);
    }
    setAnimateIn(false);
  }, [open]);

  const handlePanelTransitionEnd = (e: React.TransitionEvent<HTMLDivElement>) => {
    if (e.target !== panelAnimRef.current) return;
    if (e.propertyName !== 'transform') return;
    if (!open) setMounted(false);
  };

  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [homeAirport, setHomeAirport] = useState('');
  const [dietary, setDietary] = useState('');
  const [merchSize, setMerchSize] = useState('');
  const [preferences, setPreferences] = useState('');
  const [rates, setRates] = useState<PersonnelRates>({
    show_day_rate: 0,
    off_day_rate: 0,
    travel_day_rate: 0,
    per_diem_rate: 0,
    currency: 'GBP',
  });
  const [lpId, setLpId] = useState<string | null>(null);

  const [pp, setPp] = useState<[PersonnelPassportDetail, PersonnelPassportDetail]>([{}, {}]);
  const [ext, setExt] = useState<PersonnelExtendedProfile>({});

  // Sprint 9 §13.D — Daysheets-style multi-of-each state. Lifted
  // from legacy fields on first load (lift helpers in
  // personnel-extended-profile.ts handle the translation), so
  // existing rows show their data in the new sections without a
  // backfill. Save flow writes BOTH the v2 arrays AND mirrors
  // them to the legacy fields via the sync helpers so legacy
  // readers (rooming, advance, exports) keep working.
  const [emergencyContactsV2, setEmergencyContactsV2] = useState<PersonnelEmergencyContactV2[]>([]);
  const [passportsV2, setPassportsV2] = useState<PersonnelPassportV2[]>([]);
  const [frequentFlierV2, setFrequentFlierV2] = useState<PersonnelFrequentFlierV2[]>([]);
  const [visasV2, setVisasV2] = useState<PersonnelVisaV2[]>([]);
  const [dietaryV2, setDietaryV2] = useState<PersonnelDietaryV2[]>([]);
  const [merchSizesV2, setMerchSizesV2] = useState<PersonnelMerchSizeV2[]>([]);

  const headFileRef = useRef<HTMLInputElement>(null);
  const passFileRef = useRef<HTMLInputElement>(null);
  const [docUploadKind, setDocUploadKind] = useState<'head' | 'passport' | null>(null);
  const [docDeleting, setDocDeleting] = useState<'head' | string | null>(null);
  const [docErr, setDocErr] = useState<string | null>(null);

  const rosterPersonnelId = panel?.mode === 'edit' ? panel.id : null;

  const applyPersonnelRowDocs = (row: Personnel) => {
    setExt((prev) => ({
      ...prev,
      documents: parseExtendedProfile(row.extended_profile).documents,
    }));
    onSaved(row, { source: 'document' });
  };

  const postDocument = async (file: File, kind: 'head_shot' | 'passport_scan') => {
    if (!rosterPersonnelId) return;
    setDocErr(null);
    setDocUploadKind(kind === 'head_shot' ? 'head' : 'passport');
    const fd = new FormData();
    fd.set('file', file);
    fd.set('kind', kind);
    try {
      const res = await fetch(`/api/personnel/${rosterPersonnelId}/documents`, { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Upload failed');
      applyPersonnelRowDocs(data as Personnel);
    } catch (e) {
      setDocErr(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setDocUploadKind(null);
    }
  };

  const deleteDocument = async (body: { kind: 'head_shot' } | { kind: 'passport_scan'; path: string }) => {
    if (!rosterPersonnelId) return;
    setDocErr(null);
    setDocDeleting(body.kind === 'head_shot' ? 'head' : body.path);
    try {
      const res = await fetch(`/api/personnel/${rosterPersonnelId}/documents`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Remove failed');
      applyPersonnelRowDocs(data as Personnel);
    } catch (e) {
      setDocErr(e instanceof Error ? e.message : 'Remove failed');
    } finally {
      setDocDeleting(null);
    }
  };

  const setPass = (idx: 0 | 1, k: keyof PersonnelPassportDetail, v: string) => {
    setPp((prev) => {
      const next: [PersonnelPassportDetail, PersonnelPassportDetail] = [{ ...prev[0] }, { ...prev[1] }];
      next[idx] = { ...next[idx], [k]: v };
      return next;
    });
  };

  const resetEmpty = useCallback(() => {
    setName('');
    setRole('');
    setEmail('');
    setPhone('');
    setHomeAirport('');
    setDietary('');
    setMerchSize('');
    setPreferences('');
    setRates({
      show_day_rate: 0,
      off_day_rate: 0,
      travel_day_rate: 0,
      per_diem_rate: 0,
      currency: 'GBP',
    });
    setLpId(null);
    setPp([{}, {}]);
    setExt({});
    setEmergencyContactsV2([]);
    setPassportsV2([]);
    setFrequentFlierV2([]);
    setVisasV2([]);
    setDietaryV2([]);
    setMerchSizesV2([]);
    setError(null);
    setDocErr(null);
    setDocUploadKind(null);
    setDocDeleting(null);
  }, []);

  const loadFromPerson = useCallback((p: Personnel) => {
    setName(p.name);
    setRole(p.role ?? '');
    setEmail(p.email ?? '');
    setPhone(p.phone ?? '');
    setHomeAirport(p.home_airport ?? '');
    setDietary(p.dietary_needs ?? '');
    setMerchSize(p.merch_size ?? '');
    setPreferences(p.preferences ?? '');
    const sr = p.standard_rates as PersonnelRates | undefined;
    setRates({
      show_day_rate: Number(sr?.show_day_rate) || 0,
      off_day_rate: Number(sr?.off_day_rate) || 0,
      travel_day_rate: Number(sr?.travel_day_rate) || 0,
      per_diem_rate: Number(sr?.per_diem_rate) || 0,
      currency: typeof sr?.currency === 'string' ? sr.currency : 'GBP',
    });
    setLpId(p.lp_id);
    setPp(passportsFromPerson(p));
    const parsedExt = parseExtendedProfile(p.extended_profile);
    setExt(parsedExt);
    // Sprint 9 §13.D — lift legacy data into v2 arrays so the
    // multi-of-each sections show existing rows the first time
    // a user opens them. The lift helpers no-op when the v2
    // arrays are already populated, so re-saving doesn't lose
    // data.
    setEmergencyContactsV2(liftEmergencyContacts(parsedExt));
    setPassportsV2(liftPassportsV2(parsedExt));
    setFrequentFlierV2(liftFrequentFlier(parsedExt));
    setVisasV2(liftVisas(parsedExt));
    setDietaryV2(liftDietary(p.dietary_needs ?? null, parsedExt));
    setMerchSizesV2(liftMerchSizes(p.merch_size ?? null, parsedExt));
  }, []);

  // Sprint 9 §13.B.2 — when the operator opens the slide-over
  // by clicking a CompletenessRing, scroll the matching section
  // into view + open it. Runs after content has loaded so the
  // <details data-section> element actually exists. The
  // dependency on `loading` covers the edit-mode path which
  // sets loading=true while fetching.
  useEffect(() => {
    if (!open || !scrollToSection || loading) return;
    const host = scrollHostRef.current;
    if (!host) return;
    const target = host.querySelector<HTMLDetailsElement>(
      `details[data-section="${scrollToSection}"]`,
    );
    if (!target) return;
    target.open = true;
    // Defer one frame so the section is open before scrolling.
    const raf = requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => cancelAnimationFrame(raf);
  }, [open, scrollToSection, loading]);

  useEffect(() => {
    if (!open) return;
    if (panel?.mode === 'create') {
      resetEmpty();
      return;
    }
    if (panel?.mode === 'edit') {
      setLoading(true);
      resetEmpty();
      void (async () => {
        try {
          const res = await fetch(`/api/personnel/${panel.id}`);
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error ?? 'Failed to load');
          loadFromPerson(data as Personnel);
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Load failed');
        } finally {
          setLoading(false);
        }
      })();
    }
  }, [open, panel, resetEmpty, loadFromPerson]);

  const fillNameFromParts = () => {
    const np = ext.name_parts ?? {};
    const parts = [np.first_name, np.middle_names, np.surname].filter(Boolean).join(' ').trim();
    if (parts) setName(parts);
  };

  const save = async () => {
    setError(null);
    const n = name.trim();
    if (!n) {
      setError('Name is required');
      return;
    }
    setSaving(true);
    try {
      const passport_info = legacyPassportInfoFromPrimary(pp[0] ?? {});
      // Sprint 9 §13.D — write the v2 arrays AND mirror the
      // critical ones back to the legacy fields via the sync
      // helpers, so rooming + advance + exports keep reading
      // unchanged. Order matters: start from `ext` (carries the
      // legacy single-emergency_contact / passports[]), then
      // overlay the v2 arrays + mirror, then layer on the
      // form-style two-passport array (legacy form path).
      const cleanedEmergency = emergencyContactsV2.filter(
        (e) => (e.name ?? '').trim().length > 0,
      );
      const cleanedPassportsV2 = passportsV2.filter(
        (p) => (p.number ?? '').trim().length > 0,
      );
      const cleanedFlier = frequentFlierV2.filter(
        (f) => (f.airline ?? '').trim().length > 0 || (f.member_number ?? '').trim().length > 0,
      );
      const cleanedVisas = visasV2.filter(
        (v) => (v.country ?? '').trim().length > 0 || (v.valid_to ?? '').trim().length > 0,
      );
      const cleanedDietary = dietaryV2.filter((d) => !!d.type);
      const cleanedMerch = merchSizesV2.filter((m) => (m.size ?? '').trim().length > 0);

      let extWithV2: PersonnelExtendedProfile = {
        ...ext,
        // Form-style passport array (the legacy "Passport 1 &
        // 2" section is still wired). Will be re-overwritten
        // by syncPassportsLegacy below if there are v2 entries.
        passports: [pp[0] ?? {}, pp[1] ?? {}],
        date_of_birth: pp[0]?.date_of_birth || ext.date_of_birth,
        frequent_flier: cleanedFlier,
        visas: cleanedVisas,
        dietary: cleanedDietary,
        merch_sizes: cleanedMerch,
      };
      extWithV2 = syncEmergencyContactLegacy(extWithV2, cleanedEmergency);
      if (cleanedPassportsV2.length > 0) {
        extWithV2 = syncPassportsLegacy(extWithV2, cleanedPassportsV2);
      }

      // Sprint 9 §13.D — clear legacy mirror fields whose
      // canonical edit surface has moved to v2 arrays. Once a
      // workspace's data is fully migrated through v2 saves,
      // legacy readers will read v2 mirrors (where set) or null
      // (where the operator hasn't filled the v2 list yet).
      if (cleanedFlier.length > 0 && extWithV2.transport_extra) {
        const tx = { ...extWithV2.transport_extra };
        delete tx.frequent_flyer_1;
        delete tx.frequent_flyer_2;
        delete tx.frequent_flyer_3;
        delete tx.frequent_flyer_4;
        extWithV2.transport_extra = tx;
      }
      if (cleanedVisas.length > 0) {
        // Drop the legacy single visa block — visa notes are
        // now per-entry in cleanedVisas.
        delete extWithV2.visa;
      }
      if (cleanedMerch.length > 0) {
        delete extWithV2.clothing_sizes;
      }

      // Derive top-level column values from v2 arrays when they
      // have entries (canonical), else fall back to the loaded
      // legacy state slots. Lets payroll / rooming readers that
      // pull dietary_needs / merch_size keep working.
      const dietaryColumn = cleanedDietary.length > 0
        ? cleanedDietary
            .map((d) =>
              d.notes && d.notes.trim()
                ? `${d.type.replace(/_/g, ' ')}: ${d.notes.trim()}`
                : d.type.replace(/_/g, ' '),
            )
            .join('; ')
        : (dietary.trim() || null);
      const merchSizeColumn = cleanedMerch.length > 0
        ? cleanedMerch.map((m) => `${m.garment.replace(/_/g, ' ')}: ${m.size}`).join('; ')
        : (merchSize.trim() || null);

      const extended_profile: PersonnelExtendedProfile = extWithV2;
      // Sprint 9 §13.B.1 / Q5 — Pay section is gated; strip
      // standard_rates from the payload when the viewer can't
      // see it so a non-admin can't accidentally zero out rates
      // by saving from a panel where the Pay section was hidden.
      const standard_rates = viewerCanSeePay ? { ...rates } : undefined;
      const payload: Record<string, unknown> = {
        name: n,
        role,
        email: email.trim() || null,
        phone: phone.trim() || null,
        home_airport: homeAirport.trim() || null,
        dietary_needs: dietaryColumn,
        merch_size: merchSizeColumn,
        preferences: preferences.trim() || null,
        passport_info,
        extended_profile,
      };
      if (standard_rates !== undefined) payload.standard_rates = standard_rates;
      const isCreate = panel?.mode === 'create';
      const url = isCreate ? '/api/personnel' : `/api/personnel/${(panel as { id: string }).id}`;
      const res = await fetch(url, {
        method: isCreate ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Save failed');
      onSaved(data as Personnel);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (!mounted) return null;

  const displayTitleName = name.trim() || 'New person';

  const setAddr = (k: keyof NonNullable<PersonnelExtendedProfile['address']>, v: string) => {
    setExt((prev) => ({
      ...prev,
      address: { ...prev.address, [k]: v },
    }));
  };

  // Sprint 9 §13.D — setEm helper retired; emergency_contact is
  // now driven exclusively by the v2 multi section + sync helper.

  const setNp = (k: keyof NonNullable<PersonnelExtendedProfile['name_parts']>, v: string) => {
    setExt((prev) => ({
      ...prev,
      name_parts: { ...prev.name_parts, [k]: v },
    }));
  };

  const setUs = (k: keyof NonNullable<PersonnelExtendedProfile['us_only']>, v: string) => {
    setExt((prev) => ({
      ...prev,
      us_only: { ...prev.us_only, [k]: v },
    }));
  };

  const setTx = (k: keyof NonNullable<PersonnelExtendedProfile['transport_extra']>, v: string) => {
    setExt((prev) => ({
      ...prev,
      transport_extra: { ...prev.transport_extra, [k]: v },
    }));
  };

  const setHl = (k: keyof NonNullable<PersonnelExtendedProfile['health']>, v: string) => {
    setExt((prev) => ({
      ...prev,
      health: { ...prev.health, [k]: v },
    }));
  };

  const setMx = (k: keyof NonNullable<PersonnelExtendedProfile['merch_extras']>, v: string) => {
    setExt((prev) => ({
      ...prev,
      merch_extras: { ...prev.merch_extras, [k]: v },
    }));
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[85] bg-black/20 md:block"
        aria-hidden
        onClick={onClose}
        style={{
          opacity: animateIn ? 1 : 0,
          transition: 'opacity 200ms ease-out',
        }}
      />
      <div
        ref={panelAnimRef}
        onTransitionEnd={handlePanelTransitionEnd}
        className={cn(
          'fixed top-0 right-0 z-[90] flex h-full w-full flex-col border-l border-lp-border bg-lp-bg shadow-2xl md:w-[min(100vw,720px)]'
        )}
        style={{
          transform: animateIn ? 'translateX(0)' : 'translateX(100%)',
          opacity: animateIn ? 1 : 0,
          transition: 'transform 200ms ease-out, opacity 200ms ease-out',
        }}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-lp-border bg-lp-bg p-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-lp-text">
              Personnel details — <span className="text-lp-orange">{displayTitleName}</span>
            </h2>
            <p className="mt-1 text-xs text-lp-text-secondary">Workspace roster · matches standard touring paperwork.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-lp-text-secondary hover:bg-lp-surface hover:text-lp-text"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div ref={scrollHostRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {loading ? (
            <p className="text-sm text-lp-text-secondary">Loading…</p>
          ) : (
            <>
              <div className="mb-4 space-y-3 rounded-lg border border-yellow-500/40 bg-yellow-500/15 px-3 py-3 text-sm text-lp-text dark:bg-yellow-500/10">
                <div>
                  <p className="font-semibold text-lp-text">Documents on file</p>
                  <p className="mt-1 text-xs text-lp-text-secondary">
                    Uploads attach to this roster person immediately. You can also email a head shot and passport scan(s)
                    if you prefer.
                  </p>
                </div>
                {!rosterPersonnelId && (
                  <p className="text-xs text-lp-text-secondary">
                    Save this person once, then reopen from the roster to upload files.
                  </p>
                )}
                {docErr && <p className="text-xs text-red-600 dark:text-red-400">{docErr}</p>}

                <div className="rounded-lg border border-lp-border/80 bg-lp-bg/80 p-3 dark:bg-lp-surface/40">
                  <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-lp-text-tertiary">
                    <ImageIcon className="h-3.5 w-3.5" aria-hidden />
                    Head shot / passport-style photo
                  </div>
                  <input
                    ref={headFileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (f) void postDocument(f, 'head_shot');
                    }}
                  />
                  {ext.documents?.head_shot?.url ? (
                    <div className="flex flex-wrap items-center gap-3">
                      {ext.documents.head_shot.content_type?.startsWith('image/') ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={ext.documents.head_shot.url}
                          alt=""
                          className="h-20 w-20 rounded-lg border border-lp-border object-cover"
                        />
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs text-lp-text-secondary">{ext.documents.head_shot.file_name}</p>
                        <a
                          href={ext.documents.head_shot.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-lp-orange hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Open
                        </a>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={!rosterPersonnelId || docUploadKind !== null || docDeleting !== null}
                          onClick={() => headFileRef.current?.click()}
                          className="rounded-lg border border-lp-border bg-lp-surface px-2 py-1.5 text-xs font-medium text-lp-text hover:bg-lp-bg disabled:opacity-50"
                        >
                          {docUploadKind === 'head' ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            'Replace'
                          )}
                        </button>
                        <button
                          type="button"
                          disabled={!rosterPersonnelId || docUploadKind !== null || docDeleting !== null}
                          onClick={() => void deleteDocument({ kind: 'head_shot' })}
                          className="rounded-lg border border-red-500/40 p-1.5 text-red-600 hover:bg-red-500/10 disabled:opacity-50 dark:text-red-400"
                          aria-label="Remove head shot"
                        >
                          {docDeleting === 'head' ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={!rosterPersonnelId || docUploadKind !== null || docDeleting !== null}
                      onClick={() => headFileRef.current?.click()}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-lp-border py-6 text-xs font-medium text-lp-text-secondary hover:border-lp-orange/50 hover:text-lp-text disabled:opacity-50"
                    >
                      {docUploadKind === 'head' ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Uploading…
                        </>
                      ) : (
                        <>
                          <ImageIcon className="h-4 w-4" />
                          Drop or click to upload (JPEG, PNG, GIF, WebP)
                        </>
                      )}
                    </button>
                  )}
                </div>

                <div className="rounded-lg border border-lp-border/80 bg-lp-bg/80 p-3 dark:bg-lp-surface/40">
                  <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-lp-text-tertiary">
                    <FileText className="h-3.5 w-3.5" aria-hidden />
                    Passport scan(s)
                  </div>
                  <input
                    ref={passFileRef}
                    type="file"
                    accept="application/pdf,image/jpeg,image/png,image/gif,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (f) void postDocument(f, 'passport_scan');
                    }}
                  />
                  <ul className="mb-2 space-y-2">
                    {(ext.documents?.passport_scans ?? []).map((doc: PersonnelStoredDocument) => (
                      <li
                        key={doc.path}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-lp-border/60 bg-lp-surface/40 px-2 py-2"
                      >
                        <span className="min-w-0 flex-1 truncate text-xs text-lp-text">{doc.file_name}</span>
                        <div className="flex shrink-0 items-center gap-1">
                          <a
                            href={doc.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded p-1 text-lp-orange hover:bg-lp-bg"
                            aria-label="Open file"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                          <button
                            type="button"
                            disabled={!rosterPersonnelId || docUploadKind !== null || docDeleting !== null}
                            onClick={() => void deleteDocument({ kind: 'passport_scan', path: doc.path })}
                            className="rounded p-1 text-red-600 hover:bg-red-500/10 disabled:opacity-50 dark:text-red-400"
                            aria-label="Remove scan"
                          >
                            {docDeleting === doc.path ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    disabled={!rosterPersonnelId || docUploadKind !== null || docDeleting !== null}
                    onClick={() => passFileRef.current?.click()}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-lp-border py-4 text-xs font-medium text-lp-text-secondary hover:border-lp-orange/50 hover:text-lp-text disabled:opacity-50"
                  >
                    {docUploadKind === 'passport' ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Uploading…
                      </>
                    ) : (
                      <>
                        <FileText className="h-4 w-4" />
                        Add passport scan (PDF or image)
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Sprint 9 §13.B.1 — Identity (PERSONAL) is the
                  default-open landing section per spec. id maps
                  to computeCompleteness's "identity" weight so
                  the CompletenessRing's click-to-section flow
                  lands here when name/DOB are missing. */}
              <Section id="identity" title="General info" defaultOpen>
                {lpId && (
                  <div>
                    <L>LP ID</L>
                    <p className="font-mono text-sm text-lp-orange">{lpId}</p>
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <L>First name</L>
                    <input value={ext.name_parts?.first_name ?? ''} onChange={(e) => setNp('first_name', e.target.value)} className={IC} />
                  </div>
                  <div>
                    <L>Middle name(s)</L>
                    <input value={ext.name_parts?.middle_names ?? ''} onChange={(e) => setNp('middle_names', e.target.value)} className={IC} />
                  </div>
                  <div>
                    <L>Surname</L>
                    <input value={ext.name_parts?.surname ?? ''} onChange={(e) => setNp('surname', e.target.value)} className={IC} />
                  </div>
                  <div>
                    <L>Nickname</L>
                    <input value={ext.name_parts?.nickname ?? ''} onChange={(e) => setNp('nickname', e.target.value)} className={IC} />
                  </div>
                </div>
                <button type="button" onClick={fillNameFromParts} className="text-xs font-medium text-lp-orange hover:underline">
                  Set display name from first + middle + surname
                </button>
                <div>
                  <L>Display name (roster / rooming)</L>
                  <input value={name} onChange={(e) => setName(e.target.value)} className={IC} />
                </div>
                <div>
                  <L>Position / role</L>
                  <input value={role} onChange={(e) => setRole(e.target.value)} className={IC} placeholder="e.g. Front person, FOH" />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <L>Mobile (incl. country code)</L>
                    <input value={phone} onChange={(e) => setPhone(e.target.value)} className={IC} />
                  </div>
                  <div>
                    <L>Email</L>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={IC} />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <L>Marital status</L>
                    <input value={ext.marital_status ?? ''} onChange={(e) => setExt((p) => ({ ...p, marital_status: e.target.value }))} className={IC} />
                  </div>
                  <div>
                    <L>Sex</L>
                    <input value={ext.sex ?? ''} onChange={(e) => setExt((p) => ({ ...p, sex: e.target.value }))} className={IC} />
                  </div>
                </div>
                <div>
                  <L>Partner&apos;s name</L>
                  <input value={ext.partner_name ?? ''} onChange={(e) => setExt((p) => ({ ...p, partner_name: e.target.value }))} className={IC} />
                </div>
                <div>
                  <L>Address first line</L>
                  <input value={ext.address?.line1 ?? ''} onChange={(e) => setAddr('line1', e.target.value)} className={IC} />
                </div>
                <div>
                  <L>Address second line</L>
                  <input value={ext.address?.line2 ?? ''} onChange={(e) => setAddr('line2', e.target.value)} className={IC} />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <L>City</L>
                    <input value={ext.address?.city ?? ''} onChange={(e) => setAddr('city', e.target.value)} className={IC} />
                  </div>
                  <div>
                    <L>Post code</L>
                    <input value={ext.address?.postcode ?? ''} onChange={(e) => setAddr('postcode', e.target.value)} className={IC} />
                  </div>
                  <div>
                    <L>Country</L>
                    <input value={ext.address?.country ?? ''} onChange={(e) => setAddr('country', e.target.value)} className={IC} />
                  </div>
                </div>
                <div>
                  <L>Pronouns</L>
                  <input value={ext.pronouns ?? ''} onChange={(e) => setExt((p) => ({ ...p, pronouns: e.target.value }))} className={IC} />
                </div>
                <div>
                  <L>Nationality (general)</L>
                  <input value={ext.nationality ?? ''} onChange={(e) => setExt((p) => ({ ...p, nationality: e.target.value }))} className={IC} />
                </div>
              </Section>

              <Section id="us-only" title="US only">
                <div>
                  <L>Social Security #</L>
                  <input value={ext.us_only?.social_security_number ?? ''} onChange={(e) => setUs('social_security_number', e.target.value)} className={IC} />
                </div>
                <div>
                  <L>Green Card #</L>
                  <input value={ext.us_only?.green_card_number ?? ''} onChange={(e) => setUs('green_card_number', e.target.value)} className={IC} />
                </div>
              </Section>

              {/* Sprint 9 §13.D — legacy form-style "Passport 1
                  & 2" stays for the form fields the Daysheets v2
                  shape doesn't carry (authority, empty pages,
                  type, code). The Daysheets-style passports
                  multi section below is the canonical edit
                  surface; this section's fields write back to
                  passports[] as a mirror. Visa notes moved to
                  the per-entry Visas section below. */}
              <Section id="passports-form" title="Passport (form-style legacy fields)">
                <div className="grid gap-4 lg:grid-cols-2">
                  <PassportFields label="Passport 1" p={pp[0] ?? {}} onChange={(k, v) => setPass(0, k, v)} />
                  <PassportFields label="Passport 2" p={pp[1] ?? {}} onChange={(k, v) => setPass(1, k, v)} />
                </div>
              </Section>

              {/* Transport groups Home airport + Frequent flier
                  + TSA / aisle preferences. Either of the two
                  completeness section ids ("home-airport" /
                  "frequent-flier") can land here; we tag with
                  "home-airport" since that's the higher-weighted
                  click target. */}
              <Section id="home-airport" title="Transport">
                <div>
                  <L>Home airport</L>
                  <input value={homeAirport} onChange={(e) => setHomeAirport(e.target.value)} className={IC} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <L>TSA Pre-Check</L>
                    <input value={ext.transport_extra?.tsa_precheck ?? ''} onChange={(e) => setTx('tsa_precheck', e.target.value)} className={IC} />
                  </div>
                  <div>
                    <L>Aisle / window</L>
                    <input value={ext.transport_extra?.aisle_window ?? ''} onChange={(e) => setTx('aisle_window', e.target.value)} className={IC} />
                  </div>
                </div>
                {/* Sprint 9 §13.D — Frequent flier moved to a
                    dedicated multi-of-each section below. */}
                <p className="text-[10px] italic text-lp-text-tertiary">
                  Frequent flier programmes are now managed in their own
                  Daysheets-style section below.
                </p>
              </Section>

              {/* Sprint 9 §13.D — Emergency contacts + dietary
                  moved to dedicated multi-of-each sections below.
                  This section is now Health / Medical only. The
                  setEm helper lives in this file but is no longer
                  invoked here; kept exported because future health
                  fields (e.g. blood type) may reuse the pattern. */}
              <Section id="health" title="Health & medical">
                <div>
                  <L>Allergies to medicine?</L>
                  <input value={ext.health?.allergies_medicine ?? ''} onChange={(e) => setHl('allergies_medicine', e.target.value)} className={IC} />
                </div>
                <div>
                  <L>Medical conditions?</L>
                  <input value={ext.health?.medical_conditions ?? ''} onChange={(e) => setHl('medical_conditions', e.target.value)} className={IC} />
                </div>
                <div>
                  <L>Criminal convictions?</L>
                  <input value={ext.health?.criminal_convictions ?? ''} onChange={(e) => setHl('criminal_convictions', e.target.value)} className={IC} />
                </div>
                <div>
                  <L>Insurance info (crew only)</L>
                  <input value={ext.health?.insurance_info_crew ?? ''} onChange={(e) => setHl('insurance_info_crew', e.target.value)} className={IC} />
                </div>
                <div>
                  <L>Other medical notes (confidential)</L>
                  <textarea
                    value={ext.medical_notes ?? ''}
                    onChange={(e) => setExt((p) => ({ ...p, medical_notes: e.target.value }))}
                    rows={2}
                    className={cn(IC, 'resize-none')}
                  />
                </div>
              </Section>

              {/* Sprint 9 §13.D — Merch sizes moved to a
                  dedicated multi-of-each section below. This
                  section now carries food/beverage extras only. */}
              <Section id="merch-extras" title="Food & drink preferences">
                <div>
                  <L>Coffee order</L>
                  <textarea value={ext.merch_extras?.coffee_order ?? ''} onChange={(e) => setMx('coffee_order', e.target.value)} rows={2} className={cn(IC, 'resize-none')} />
                </div>
                <div>
                  <L>Pizza order</L>
                  <textarea value={ext.merch_extras?.pizza_order ?? ''} onChange={(e) => setMx('pizza_order', e.target.value)} rows={2} className={cn(IC, 'resize-none')} />
                </div>
              </Section>

              <Section id="travel-notes" title="Notes for travel">
                <textarea
                  value={ext.travel_notes ?? ''}
                  onChange={(e) => setExt((p) => ({ ...p, travel_notes: e.target.value }))}
                  rows={4}
                  placeholder="Flying in/out of different cities than home, hotels not needed, etc."
                  className={cn(IC, 'resize-none')}
                />
              </Section>

              {/* Sprint 9 §13.B.1 — Pay section is admin /
                  manager only per spec + Q5. The gate is set
                  at the slide-over root via viewerCanSeePay. */}
              {viewerCanSeePay ? (
              <Section id="pay" title="Default day rates">
                <div>
                  <L>Currency</L>
                  <BrandedSelect
                    value={rates.currency}
                    onChange={(v) => setRates((r) => ({ ...r, currency: v }))}
                    className="w-full"
                    triggerClassName="w-full"
                    ariaLabel="Currency"
                    options={CUR.map((c) => ({ value: c, label: c }))}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      ['show_day_rate', 'Show day'],
                      ['off_day_rate', 'Off day'],
                      ['travel_day_rate', 'Travel / rehearsal'],
                      ['per_diem_rate', 'Per diem'],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key}>
                      <L>{label}</L>
                      <input
                        type="number"
                        min={0}
                        value={rates[key]}
                        onChange={(e) => setRates((r) => ({ ...r, [key]: Number(e.target.value) || 0 }))}
                        className={IC}
                      />
                    </div>
                  ))}
                </div>
              </Section>
              ) : null}

              <Section id="other" title="Other">
                <div>
                  <L>Instruments / skills</L>
                  <input value={ext.instruments ?? ''} onChange={(e) => setExt((p) => ({ ...p, instruments: e.target.value }))} className={IC} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <L>Instagram</L>
                    <input
                      value={ext.social?.instagram ?? ''}
                      onChange={(e) => setExt((p) => ({ ...p, social: { ...p.social, instagram: e.target.value } }))}
                      className={IC}
                    />
                  </div>
                  <div>
                    <L>X / Twitter</L>
                    <input
                      value={ext.social?.twitter ?? ''}
                      onChange={(e) => setExt((p) => ({ ...p, social: { ...p.social, twitter: e.target.value } }))}
                      className={IC}
                    />
                  </div>
                </div>
                <div>
                  <L>Preferences</L>
                  <textarea value={preferences} onChange={(e) => setPreferences(e.target.value)} rows={2} className={cn(IC, 'resize-none')} />
                </div>
                <div>
                  <L>Internal notes (TM only)</L>
                  <textarea value={ext.internal_notes ?? ''} onChange={(e) => setExt((p) => ({ ...p, internal_notes: e.target.value }))} rows={2} className={cn(IC, 'resize-none')} />
                </div>
              </Section>

              {/* Sprint 9 §13.D — Daysheets-style multi-of-each
                  sections. Each writes to its v2 array on
                  extended_profile + the legacy mirror via the
                  sync helpers in personnel-extended-profile.ts.
                  All six default-collapsed (Identity / "General
                  info" is the only default-open section per
                  §13.B.1 spec). */}
              <Section id="emergency" title="Emergency contacts">
                <MultiList<PersonnelEmergencyContactV2>
                  items={emergencyContactsV2}
                  empty="No emergency contacts yet."
                  addLabel="Add emergency contact"
                  /* Sprint 9 §14.2 — first +Add lifts legacy
                     emergency_contact into the new entry so the
                     operator gets a populated starting point
                     instead of a blank form. Legacy is empty →
                     entry is blank. Subsequent +Adds always
                     blank. */
                  onAdd={() =>
                    setEmergencyContactsV2((arr) => {
                      if (arr.length === 0) {
                        const lifted = liftEmergencyContacts(ext);
                        if (lifted.length > 0) return lifted;
                      }
                      return [
                        ...arr,
                        { name: '', relationship: '', phone: '', email: '' },
                      ];
                    })
                  }
                  onRemove={(i) =>
                    setEmergencyContactsV2((arr) => arr.filter((_, idx) => idx !== i))
                  }
                  renderEntry={(entry, i) => (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <L>Name</L>
                        <input
                          value={entry.name}
                          onChange={(e) =>
                            setEmergencyContactsV2((arr) =>
                              arr.map((row, idx) =>
                                idx === i ? { ...row, name: e.target.value } : row,
                              ),
                            )
                          }
                          className={IC}
                        />
                      </div>
                      <div>
                        <L>Relationship</L>
                        <input
                          value={entry.relationship}
                          onChange={(e) =>
                            setEmergencyContactsV2((arr) =>
                              arr.map((row, idx) =>
                                idx === i
                                  ? { ...row, relationship: e.target.value }
                                  : row,
                              ),
                            )
                          }
                          className={IC}
                        />
                      </div>
                      <div>
                        <L>Phone</L>
                        <input
                          value={entry.phone}
                          onChange={(e) =>
                            setEmergencyContactsV2((arr) =>
                              arr.map((row, idx) =>
                                idx === i ? { ...row, phone: e.target.value } : row,
                              ),
                            )
                          }
                          className={IC}
                        />
                      </div>
                      <div>
                        <L>Email (optional)</L>
                        <input
                          type="email"
                          value={entry.email ?? ''}
                          onChange={(e) =>
                            setEmergencyContactsV2((arr) =>
                              arr.map((row, idx) =>
                                idx === i ? { ...row, email: e.target.value } : row,
                              ),
                            )
                          }
                          className={IC}
                        />
                      </div>
                    </div>
                  )}
                />
              </Section>

              <Section id="passports" title="Passports (Daysheets-style)">
                <MultiList<PersonnelPassportV2>
                  items={passportsV2}
                  empty="No passports yet."
                  addLabel="Add passport"
                  /* Sprint 9 §14.2 — first +Add lifts legacy
                     form-style passports[] entries into v2
                     shape so the operator doesn't re-enter
                     country / number / dates. */
                  onAdd={() =>
                    setPassportsV2((arr) => {
                      if (arr.length === 0) {
                        const lifted = liftPassportsV2(ext);
                        if (lifted.length > 0) return lifted;
                      }
                      return [
                        ...arr,
                        {
                          country: '',
                          number: '',
                          given_names: '',
                          surname: '',
                          date_of_expiry: '',
                        },
                      ];
                    })
                  }
                  onRemove={(i) =>
                    setPassportsV2((arr) => arr.filter((_, idx) => idx !== i))
                  }
                  renderEntry={(entry, i) => {
                    const update = (patch: Partial<PersonnelPassportV2>) =>
                      setPassportsV2((arr) =>
                        arr.map((row, idx) => (idx === i ? { ...row, ...patch } : row)),
                      );
                    return (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <L>Country</L>
                          <input
                            value={entry.country}
                            onChange={(e) => update({ country: e.target.value })}
                            className={IC}
                          />
                        </div>
                        <div>
                          <L>Passport #</L>
                          <input
                            value={entry.number}
                            onChange={(e) => update({ number: e.target.value })}
                            className={IC}
                          />
                        </div>
                        <div>
                          <L>Given names</L>
                          <input
                            value={entry.given_names}
                            onChange={(e) => update({ given_names: e.target.value })}
                            className={IC}
                          />
                        </div>
                        <div>
                          <L>Surname</L>
                          <input
                            value={entry.surname}
                            onChange={(e) => update({ surname: e.target.value })}
                            className={IC}
                          />
                        </div>
                        <div>
                          <L>Date of issue</L>
                          <input
                            type="date"
                            value={entry.date_of_issue ?? ''}
                            onChange={(e) => update({ date_of_issue: e.target.value })}
                            className={IC}
                          />
                        </div>
                        <div>
                          <L>Date of expiry</L>
                          <input
                            type="date"
                            value={entry.date_of_expiry}
                            onChange={(e) => update({ date_of_expiry: e.target.value })}
                            className={IC}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <L>Place of birth</L>
                          <input
                            value={entry.place_of_birth ?? ''}
                            onChange={(e) => update({ place_of_birth: e.target.value })}
                            className={IC}
                          />
                        </div>
                      </div>
                    );
                  }}
                />
              </Section>

              <Section id="frequent-flier" title="Frequent flier">
                <MultiList<PersonnelFrequentFlierV2>
                  items={frequentFlierV2}
                  empty="No frequent flier programmes yet."
                  addLabel="Add airline"
                  /* Sprint 9 §14.2 — first +Add lifts ALL legacy
                     frequent_flyer_1..4 entries (not just one)
                     since the legacy shape carried up to four
                     lines. Subsequent +Adds always blank. */
                  onAdd={() =>
                    setFrequentFlierV2((arr) => {
                      if (arr.length === 0) {
                        const lifted = liftFrequentFlier(ext);
                        if (lifted.length > 0) return lifted;
                      }
                      return [
                        ...arr,
                        { airline: '', member_number: '' },
                      ];
                    })
                  }
                  onRemove={(i) =>
                    setFrequentFlierV2((arr) => arr.filter((_, idx) => idx !== i))
                  }
                  renderEntry={(entry, i) => {
                    const update = (patch: Partial<PersonnelFrequentFlierV2>) =>
                      setFrequentFlierV2((arr) =>
                        arr.map((row, idx) => (idx === i ? { ...row, ...patch } : row)),
                      );
                    return (
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div>
                          <L>Airline</L>
                          <input
                            value={entry.airline}
                            onChange={(e) => update({ airline: e.target.value })}
                            className={IC}
                          />
                        </div>
                        <div>
                          <L>Member #</L>
                          <input
                            value={entry.member_number}
                            onChange={(e) => update({ member_number: e.target.value })}
                            className={IC}
                          />
                        </div>
                        <div>
                          <L>Tier</L>
                          <select
                            value={entry.tier ?? ''}
                            onChange={(e) =>
                              update({
                                tier:
                                  e.target.value === ''
                                    ? undefined
                                    : (e.target.value as PersonnelFrequentFlierTier),
                              })
                            }
                            className={IC}
                            style={{ height: SELECT_HEIGHT_PX }}
                          >
                            <option value="">—</option>
                            {FLIER_TIERS.map((t) => (
                              <option key={t.value} value={t.value}>
                                {t.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    );
                  }}
                />
              </Section>

              <Section id="visas" title="Visas">
                <MultiList<PersonnelVisaV2>
                  items={visasV2}
                  empty="No visas on file."
                  addLabel="Add visa"
                  /* Sprint 9 §14.2 — first +Add lifts legacy
                     ext.visa block (single object) into a v2
                     entry. */
                  onAdd={() =>
                    setVisasV2((arr) => {
                      if (arr.length === 0) {
                        const lifted = liftVisas(ext);
                        if (lifted.length > 0) return lifted;
                      }
                      return [
                        ...arr,
                        { country: '', type: '', valid_to: '' },
                      ];
                    })
                  }
                  onRemove={(i) =>
                    setVisasV2((arr) => arr.filter((_, idx) => idx !== i))
                  }
                  renderEntry={(entry, i) => {
                    const update = (patch: Partial<PersonnelVisaV2>) =>
                      setVisasV2((arr) =>
                        arr.map((row, idx) => (idx === i ? { ...row, ...patch } : row)),
                      );
                    /* Sprint 9 §14.14 — extended visa fields:
                       visa number, multi-entry flag, issuing
                       authority. Layout order matches the spec:
                       country → type → number → multi-entry
                       checkbox → issuing authority → dates →
                       notes. */
                    return (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <L>Country</L>
                          <input
                            value={entry.country}
                            onChange={(e) => update({ country: e.target.value })}
                            className={IC}
                          />
                        </div>
                        <div>
                          <L>Type</L>
                          <input
                            value={entry.type}
                            onChange={(e) => update({ type: e.target.value })}
                            className={IC}
                            placeholder="e.g. Tourist B1/B2"
                          />
                        </div>
                        <div>
                          <L>Visa number</L>
                          <input
                            value={entry.visa_number ?? ''}
                            onChange={(e) => update({ visa_number: e.target.value })}
                            className={IC}
                          />
                        </div>
                        <div>
                          <L>Entries</L>
                          <label
                            className="inline-flex items-center"
                            style={{
                              gap: 8,
                              padding: 'var(--lp-space-2) var(--lp-space-3)',
                              background: 'var(--lp-surface)',
                              border: '1px solid var(--lp-border)',
                              borderRadius: 'var(--lp-radius-md)',
                              cursor: 'pointer',
                              fontSize: 'var(--lp-text-sm)',
                              color: 'var(--lp-text)',
                              height: SELECT_HEIGHT_PX,
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={!!entry.multi_entry}
                              onChange={(e) => update({ multi_entry: e.target.checked })}
                              style={{ accentColor: 'var(--color-lp-orange)' }}
                            />
                            <span>Multi-entry</span>
                          </label>
                        </div>
                        <div className="sm:col-span-2">
                          <L>Issuing authority</L>
                          <input
                            value={entry.issuing_authority ?? ''}
                            onChange={(e) => update({ issuing_authority: e.target.value })}
                            className={IC}
                            placeholder="Embassy / consulate / agency"
                          />
                        </div>
                        <div>
                          <L>Valid from</L>
                          <input
                            type="date"
                            value={entry.valid_from ?? ''}
                            onChange={(e) => update({ valid_from: e.target.value })}
                            className={IC}
                          />
                        </div>
                        <div>
                          <L>Valid to</L>
                          <input
                            type="date"
                            value={entry.valid_to}
                            onChange={(e) => update({ valid_to: e.target.value })}
                            className={IC}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <L>Notes</L>
                          <textarea
                            value={entry.notes ?? ''}
                            onChange={(e) => update({ notes: e.target.value })}
                            rows={2}
                            className={cn(IC, 'resize-none')}
                          />
                        </div>
                      </div>
                    );
                  }}
                />
              </Section>

              <Section id="dietary" title="Dietary requirements">
                <MultiList<PersonnelDietaryV2>
                  items={dietaryV2}
                  empty="No dietary requirements specified."
                  addLabel="Add dietary requirement"
                  /* Sprint 9 §14.2 — first +Add lifts the legacy
                     dietary_needs string (top-level personnel
                     column, held in `dietary` state) into a
                     custom-typed entry so the operator can
                     refine without retyping. */
                  onAdd={() =>
                    setDietaryV2((arr) => {
                      if (arr.length === 0) {
                        const lifted = liftDietary(dietary, ext);
                        if (lifted.length > 0) return lifted;
                      }
                      return [
                        ...arr,
                        { type: 'vegetarian' },
                      ];
                    })
                  }
                  onRemove={(i) =>
                    setDietaryV2((arr) => arr.filter((_, idx) => idx !== i))
                  }
                  renderEntry={(entry, i) => {
                    const update = (patch: Partial<PersonnelDietaryV2>) =>
                      setDietaryV2((arr) =>
                        arr.map((row, idx) => (idx === i ? { ...row, ...patch } : row)),
                      );
                    return (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <L>Type</L>
                          <select
                            value={entry.type}
                            onChange={(e) =>
                              update({ type: e.target.value as PersonnelDietaryType })
                            }
                            className={IC}
                            style={{ height: SELECT_HEIGHT_PX }}
                          >
                            {DIETARY_TYPES.map((t) => (
                              <option key={t.value} value={t.value}>
                                {t.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <L>Notes / details</L>
                          <input
                            value={entry.notes ?? ''}
                            onChange={(e) => update({ notes: e.target.value })}
                            className={IC}
                            placeholder="e.g. severe nut allergy"
                          />
                        </div>
                      </div>
                    );
                  }}
                />
              </Section>

              <Section id="merch-sizes" title="Merch sizes (Daysheets-style)">
                <MultiList<PersonnelMerchSizeV2>
                  items={merchSizesV2}
                  empty="No merch sizes recorded."
                  addLabel="Add size"
                  /* Sprint 9 §14.2 — first +Add lifts legacy
                     clothing_sizes block + merch_size string
                     into v2 entries (one per filled garment)
                     so the operator doesn't re-enter every
                     size. */
                  onAdd={() =>
                    setMerchSizesV2((arr) => {
                      if (arr.length === 0) {
                        const lifted = liftMerchSizes(merchSize, ext);
                        if (lifted.length > 0) return lifted;
                      }
                      return [
                        ...arr,
                        { garment: 't_shirt', size: '' },
                      ];
                    })
                  }
                  onRemove={(i) =>
                    setMerchSizesV2((arr) => arr.filter((_, idx) => idx !== i))
                  }
                  renderEntry={(entry, i) => {
                    const update = (patch: Partial<PersonnelMerchSizeV2>) =>
                      setMerchSizesV2((arr) =>
                        arr.map((row, idx) => (idx === i ? { ...row, ...patch } : row)),
                      );
                    return (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <L>Garment</L>
                          <select
                            value={entry.garment}
                            onChange={(e) =>
                              update({ garment: e.target.value as PersonnelGarment })
                            }
                            className={IC}
                            style={{ height: SELECT_HEIGHT_PX }}
                          >
                            {GARMENTS.map((g) => (
                              <option key={g.value} value={g.value}>
                                {g.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <L>Size</L>
                          <input
                            value={entry.size}
                            onChange={(e) => update({ size: e.target.value })}
                            className={IC}
                            placeholder="XS / S / M / L / XL / 30 / 10 etc."
                          />
                        </div>
                      </div>
                    );
                  }}
                />
              </Section>

              <div className="mt-6 rounded-lg border border-lp-border bg-lp-surface/40 p-4 text-[11px] leading-relaxed text-lp-text-secondary">
                <p className="font-semibold text-lp-text">Data protection (GDPR)</p>
                <p className="mt-2">
                  This information may be shared with travel agents, airlines, hotels, and promoters only as needed to operate the tour. Store and
                  share it in line with your workspace policies and local law.
                </p>
              </div>

              {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}
            </>
          )}
        </div>

        <footer className="shrink-0 border-t border-lp-border bg-lp-bg p-4">
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-lp-border px-4 py-2 text-sm font-medium text-lp-text hover:bg-lp-surface">
              Cancel
            </button>
            <button
              type="button"
              disabled={saving || loading}
              onClick={() => void save()}
              className="rounded-lg bg-lp-orange px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </footer>
      </div>
    </>
  );
}

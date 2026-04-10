'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, FileText, ImageIcon, Loader2, Trash2, X } from 'lucide-react';
import type { Personnel, PersonnelRates } from '@/types';
import type {
  PersonnelExtendedProfile,
  PersonnelPassportDetail,
  PersonnelStoredDocument,
} from '@/lib/personnel-extended-profile';
import {
  legacyPassportInfoFromPrimary,
  parseExtendedProfile,
  passportsFromPerson,
} from '@/lib/personnel-extended-profile';
import { cn } from '@/lib/utils';

export type PersonnelPanelState = null | { mode: 'create' } | { mode: 'edit'; id: string };

const IC =
  'w-full rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text outline-none focus:border-lp-orange';
const CUR = ['GBP', 'EUR', 'USD'] as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details open className="group border-b border-lp-border/80 pb-4 last:border-0">
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
  onClose,
  onSaved,
}: {
  panel: PersonnelPanelState;
  onClose: () => void;
  onSaved: (row: Personnel, meta?: { source?: 'form' | 'document' }) => void;
}) {
  const open = panel !== null;
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setExt(parseExtendedProfile(p.extended_profile));
  }, []);

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
      const extended_profile: PersonnelExtendedProfile = {
        ...ext,
        passports: [pp[0] ?? {}, pp[1] ?? {}],
        date_of_birth: pp[0]?.date_of_birth || ext.date_of_birth,
      };
      const standard_rates = { ...rates };
      const payload = {
        name: n,
        role,
        email: email.trim() || null,
        phone: phone.trim() || null,
        home_airport: homeAirport.trim() || null,
        dietary_needs: dietary.trim() || null,
        merch_size: merchSize.trim() || null,
        preferences: preferences.trim() || null,
        standard_rates,
        passport_info,
        extended_profile,
      };
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

  if (!open) return null;

  const displayTitleName = name.trim() || 'New person';

  const setAddr = (k: keyof NonNullable<PersonnelExtendedProfile['address']>, v: string) => {
    setExt((prev) => ({
      ...prev,
      address: { ...prev.address, [k]: v },
    }));
  };

  const setEm = (k: keyof NonNullable<PersonnelExtendedProfile['emergency_contact']>, v: string) => {
    setExt((prev) => ({
      ...prev,
      emergency_contact: { ...prev.emergency_contact, [k]: v },
    }));
  };

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
      <div className="fixed inset-0 z-[85] bg-black/20 md:block" aria-hidden onClick={onClose} />
      <div
        className={cn(
          'fixed top-0 right-0 z-[90] flex h-full w-full flex-col border-l border-lp-border bg-lp-bg shadow-2xl transition-transform duration-200 ease-out md:w-[min(100vw,720px)]'
        )}
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

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
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

              <Section title="General info">
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

              <Section title="US only">
                <div>
                  <L>Social Security #</L>
                  <input value={ext.us_only?.social_security_number ?? ''} onChange={(e) => setUs('social_security_number', e.target.value)} className={IC} />
                </div>
                <div>
                  <L>Green Card #</L>
                  <input value={ext.us_only?.green_card_number ?? ''} onChange={(e) => setUs('green_card_number', e.target.value)} className={IC} />
                </div>
              </Section>

              <Section title="Passport 1 & passport 2">
                <div className="grid gap-4 lg:grid-cols-2">
                  <PassportFields label="Passport 1" p={pp[0] ?? {}} onChange={(k, v) => setPass(0, k, v)} />
                  <PassportFields label="Passport 2" p={pp[1] ?? {}} onChange={(k, v) => setPass(1, k, v)} />
                </div>
                <div>
                  <L>Visa / ESTA (notes)</L>
                  <textarea
                    value={ext.visa?.notes ?? ''}
                    onChange={(e) => setExt((p) => ({ ...p, visa: { ...p.visa, notes: e.target.value } }))}
                    rows={2}
                    className={cn(IC, 'resize-none')}
                  />
                </div>
              </Section>

              <Section title="Transport">
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
                <p className="text-[10px] font-semibold uppercase tracking-wide text-lp-text-tertiary">Frequent flyer</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(['frequent_flyer_1', 'frequent_flyer_2', 'frequent_flyer_3', 'frequent_flyer_4'] as const).map((k) => (
                    <div key={k}>
                      <L>{k.replace('frequent_flyer_', 'Line ')}</L>
                      <input value={ext.transport_extra?.[k] ?? ''} onChange={(e) => setTx(k, e.target.value)} className={IC} />
                    </div>
                  ))}
                </div>
              </Section>

              <Section title="Important / emergency">
                <div>
                  <L>Dietary requirements / allergies</L>
                  <input value={dietary} onChange={(e) => setDietary(e.target.value)} className={IC} />
                </div>
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
                  <L>Emergency contact</L>
                  <input value={ext.emergency_contact?.name ?? ''} onChange={(e) => setEm('name', e.target.value)} className={IC} />
                </div>
                <div>
                  <L>Relation to you</L>
                  <input value={ext.emergency_contact?.relationship ?? ''} onChange={(e) => setEm('relationship', e.target.value)} className={IC} />
                </div>
                <div>
                  <L>Contact number</L>
                  <input value={ext.emergency_contact?.phone ?? ''} onChange={(e) => setEm('phone', e.target.value)} className={IC} />
                </div>
                <div>
                  <L>Emergency email</L>
                  <input value={ext.emergency_contact?.email ?? ''} onChange={(e) => setEm('email', e.target.value)} className={IC} />
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

              <Section title="Merch etc">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <L>T-shirt size</L>
                    <input
                      value={ext.clothing_sizes?.shirt ?? ''}
                      onChange={(e) =>
                        setExt((p) => ({
                          ...p,
                          clothing_sizes: { ...p.clothing_sizes, shirt: e.target.value },
                        }))
                      }
                      className={IC}
                    />
                  </div>
                  <div>
                    <L>Hoody / jacket</L>
                    <input
                      value={ext.clothing_sizes?.jacket ?? ''}
                      onChange={(e) =>
                        setExt((p) => ({
                          ...p,
                          clothing_sizes: { ...p.clothing_sizes, jacket: e.target.value },
                        }))
                      }
                      className={IC}
                    />
                  </div>
                  <div>
                    <L>Shoes</L>
                    <input
                      value={ext.clothing_sizes?.shoe ?? ''}
                      onChange={(e) =>
                        setExt((p) => ({
                          ...p,
                          clothing_sizes: { ...p.clothing_sizes, shoe: e.target.value },
                        }))
                      }
                      className={IC}
                    />
                  </div>
                </div>
                <div>
                  <L>Merch size (legacy single field)</L>
                  <input value={merchSize} onChange={(e) => setMerchSize(e.target.value)} className={IC} />
                </div>
                <div>
                  <L>Coffee order</L>
                  <textarea value={ext.merch_extras?.coffee_order ?? ''} onChange={(e) => setMx('coffee_order', e.target.value)} rows={2} className={cn(IC, 'resize-none')} />
                </div>
                <div>
                  <L>Pizza order</L>
                  <textarea value={ext.merch_extras?.pizza_order ?? ''} onChange={(e) => setMx('pizza_order', e.target.value)} rows={2} className={cn(IC, 'resize-none')} />
                </div>
              </Section>

              <Section title="Notes for travel">
                <textarea
                  value={ext.travel_notes ?? ''}
                  onChange={(e) => setExt((p) => ({ ...p, travel_notes: e.target.value }))}
                  rows={4}
                  placeholder="Flying in/out of different cities than home, hotels not needed, etc."
                  className={cn(IC, 'resize-none')}
                />
              </Section>

              <Section title="Default day rates">
                <div>
                  <L>Currency</L>
                  <select value={rates.currency} onChange={(e) => setRates((r) => ({ ...r, currency: e.target.value }))} className={IC}>
                    {CUR.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
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

              <Section title="Other">
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

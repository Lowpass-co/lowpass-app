'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { deleteTourPersonnel, getPersonById, updatePerson, updateTourPersonnel, type TourPersonnelPatch } from '@/lib/api/persons';
import type { Person, TourPerson } from '@/lib/types/person';
import { cn } from '@/lib/utils';
import { SlideOver } from '@/components/ui/SlideOver';

const IC =
  'w-full rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text outline-none focus:border-lp-orange';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 border-b border-lp-border/70 pb-4">
      <h3 className="text-[10px] font-bold uppercase tracking-wider text-lp-text-tertiary">{title}</h3>
      {children}
    </section>
  );
}

function dateInput(iso: string | null): string {
  if (!iso) return '';
  try {
    return iso.slice(0, 10);
  } catch {
    return '';
  }
}

function TourPersonnelRowEditor({
  tp,
  tourLabel,
  isWorkspaceAdmin,
  onSaved,
  onRemoved,
}: {
  tp: TourPerson;
  tourLabel: string;
  isWorkspaceAdmin: boolean;
  onSaved: (next: TourPerson) => void;
  onRemoved: () => void;
}) {
  const [role, setRole] = useState(tp.role);
  const [employmentType, setEmploymentType] = useState(tp.employmentType ?? '');
  // Rates SSOT — no competing rate-amount edit here; the tour rate lives in the
  // Payroll Rates grid (personnel_rate_lines). Currency/period stay as metadata.
  const [rateCurrency, setRateCurrency] = useState(tp.rateCurrency || 'GBP');
  const [ratePeriod, setRatePeriod] = useState(tp.ratePeriod ?? '');
  const [startsOn, setStartsOn] = useState(dateInput(tp.startsOn));
  const [endsOn, setEndsOn] = useState(dateInput(tp.endsOn));
  const [saving, setSaving] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  useEffect(() => {
    setRole(tp.role);
    setEmploymentType(tp.employmentType ?? '');
    setRateCurrency(tp.rateCurrency || 'GBP');
    setRatePeriod(tp.ratePeriod ?? '');
    setStartsOn(dateInput(tp.startsOn));
    setEndsOn(dateInput(tp.endsOn));
    setRowError(null);
  }, [tp]);

  const baseline = useMemo(() => {
    return {
      role: tp.role,
      employment_type: tp.employmentType ?? null,
      rate_currency: tp.rateCurrency || 'GBP',
      rate_period: tp.ratePeriod,
      starts_on: dateInput(tp.startsOn) || null,
      ends_on: dateInput(tp.endsOn) || null,
    };
  }, [tp]);

  const dirty = useMemo(() => {
    return (
      role !== baseline.role ||
      (employmentType || null) !== baseline.employment_type ||
      rateCurrency !== baseline.rate_currency ||
      (ratePeriod || null) !== baseline.rate_period ||
      (startsOn || null) !== baseline.starts_on ||
      (endsOn || null) !== baseline.ends_on
    );
  }, [baseline, role, employmentType, rateCurrency, ratePeriod, startsOn, endsOn]);

  const persist = async () => {
    setSaving(true);
    setRowError(null);
    try {
      const updated = await updateTourPersonnel(tp.id, {
        role,
        employment_type: employmentType === '' ? null : (employmentType as NonNullable<TourPersonnelPatch['employment_type']>),
        rate_currency: rateCurrency || 'GBP',
        rate_period: ratePeriod === '' ? null : (ratePeriod as NonNullable<TourPersonnelPatch['rate_period']>),
        starts_on: startsOn === '' ? null : startsOn,
        ends_on: endsOn === '' ? null : endsOn,
      });
      onSaved(updated);
    } catch (e) {
      setRowError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!isWorkspaceAdmin) return;
    if (!window.confirm(`Remove assignment from "${tourLabel}"?`)) return;
    setSaving(true);
    setRowError(null);
    try {
      await deleteTourPersonnel(tp.id);
      onRemoved();
    } catch (e) {
      setRowError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2 rounded-lg border border-lp-border bg-lp-surface p-3">
      <div className="text-xs font-medium text-lp-text">{tourLabel}</div>
      {rowError && <p className="text-xs text-red-600">{rowError}</p>}
      <div className="grid gap-3 sm:grid-cols-3">
        <input className={IC} placeholder="Role" value={role} onChange={(e) => setRole(e.target.value)} />
        <select
          className={IC}
          value={employmentType}
          onChange={(e) => setEmploymentType(e.target.value)}
          aria-label="Employment type"
        >
          <option value="">Employment…</option>
          <option value="staff">Staff</option>
          <option value="freelance">Freelance</option>
          <option value="crew">Crew</option>
          <option value="band">Band</option>
          <option value="mgmt">Mgmt</option>
        </select>
        <input
          className={IC}
          placeholder="ISO currency"
          maxLength={3}
          value={rateCurrency}
          onChange={(e) => setRateCurrency(e.target.value.toUpperCase())}
          aria-label="Rate currency"
        />
        <select className={IC} value={ratePeriod} onChange={(e) => setRatePeriod(e.target.value)} aria-label="Rate period">
          <option value="">Period…</option>
          <option value="day">Day</option>
          <option value="week">Week</option>
          <option value="flat">Flat</option>
          <option value="hour">Hour</option>
        </select>
        <input className={IC} type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} aria-label="Starts on" />
        <input className={IC} type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} aria-label="Ends on" />
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-md bg-lp-orange px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          disabled={!dirty || saving}
          onClick={() => void persist()}
        >
          {saving ? 'Saving…' : 'Save assignment'}
        </button>
        {isWorkspaceAdmin ? (
          <button
            type="button"
            className="rounded-md border border-lp-border px-3 py-1.5 text-xs text-red-600 disabled:opacity-50"
            disabled={saving}
            onClick={() => void remove()}
          >
            Delete
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default function PersonSlideOver({ id, onClose }: { id: string; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [person, setPerson] = useState<Person | null>(null);

  const [fullName, setFullName] = useState('');
  const [preferredName, setPreferredName] = useState('');
  const [pronouns, setPronouns] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [passportFullName, setPassportFullName] = useState('');
  const [passportNumber, setPassportNumber] = useState('');
  const [passportExpiry, setPassportExpiry] = useState('');
  const [passportCountry, setPassportCountry] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [dietary, setDietary] = useState('');
  const [notes, setNotes] = useState('');

  const [isWorkspaceAdmin, setIsWorkspaceAdmin] = useState(false);

  useEffect(() => {
    fetch('/api/workspace/me', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.isWorkspaceAdmin) setIsWorkspaceAdmin(true);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getPersonById(id)
      .then((p) => {
        if (!p) throw new Error('Person not found');
        setPerson(p);
        setFullName(p.fullName);
        setPreferredName(p.preferredName ?? '');
        setPronouns(p.pronouns ?? '');
        setEmail(p.email ?? '');
        setPhone(p.phone ?? '');
        setEmergencyContact(p.emergencyContact ?? '');
        setPassportFullName(p.passportFullName ?? '');
        setPassportNumber(p.passportNumber ?? '');
        setPassportExpiry(p.passportExpiry ?? '');
        setPassportCountry(p.passportCountry ?? '');
        setDateOfBirth(p.dateOfBirth ?? '');
        setDietary(p.dietary ?? '');
        setNotes(p.notes ?? '');
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [id]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await updatePerson(id, {
        full_name: fullName,
        preferred_name: preferredName || null,
        pronouns: pronouns || null,
        email: email || null,
        phone: phone || null,
        emergency_contact: emergencyContact || null,
        passport_full_name: passportFullName || null,
        passport_number: passportNumber || null,
        passport_expiry: passportExpiry || null,
        passport_country: passportCountry || null,
        date_of_birth: dateOfBirth || null,
        dietary: dietary || null,
        notes: notes || null,
      });
      setPerson(updated);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SlideOver
      open
      onClose={onClose}
      title={person?.preferredName ?? person?.fullName ?? 'Person'}
      subtitle={
        <span className="text-xs" style={{ color: 'var(--lp-text-secondary)' }}>
          Canonical person record
        </span>
      }
      width="wide"
      backdrop
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" className="rounded-md border border-lp-border px-3 py-2 text-sm text-lp-text" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || loading}
            className="rounded-md bg-lp-orange px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save person'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-lp-text-secondary">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading person...
          </div>
        )}
        {error && <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        {!loading && (
          <>
            <Section title="Identity">
              <div className="grid gap-3 sm:grid-cols-3">
                <input className={IC} placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
                <input className={IC} placeholder="Preferred name" value={preferredName} onChange={(e) => setPreferredName(e.target.value)} />
                <input className={IC} placeholder="Pronouns" value={pronouns} onChange={(e) => setPronouns(e.target.value)} />
              </div>
            </Section>
            <Section title="Contact">
              <div className="grid gap-3 sm:grid-cols-3">
                <input className={IC} placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
                <input className={IC} placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
                <input className={IC} placeholder="Emergency contact" value={emergencyContact} onChange={(e) => setEmergencyContact(e.target.value)} />
              </div>
            </Section>
            <Section title="Travel">
              <div className="grid gap-3 sm:grid-cols-3">
                <input className={IC} placeholder="Passport name" value={passportFullName} onChange={(e) => setPassportFullName(e.target.value)} />
                <input className={IC} placeholder="Passport number" value={passportNumber} onChange={(e) => setPassportNumber(e.target.value)} />
                <input className={IC} type="date" value={passportExpiry} onChange={(e) => setPassportExpiry(e.target.value)} />
                <input className={IC} placeholder="Passport country" value={passportCountry} onChange={(e) => setPassportCountry(e.target.value)} />
                <input className={IC} type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
                <input className={IC} placeholder="Dietary" value={dietary} onChange={(e) => setDietary(e.target.value)} />
              </div>
            </Section>
            {/* Per-tour employment and rate (tour_personnel). */}
            <Section title="Tours">
              <div className="space-y-3">
                {(person?.tourPersonnel ?? []).length === 0 ? (
                  <p className="text-xs text-lp-text-tertiary">No tour assignments.</p>
                ) : (
                  (person?.tourPersonnel ?? []).map((tp) => (
                    <TourPersonnelRowEditor
                      key={tp.id}
                      tp={tp}
                      tourLabel={tp.tourName ?? tp.tourId}
                      isWorkspaceAdmin={isWorkspaceAdmin}
                      onSaved={(next) => {
                        setPerson((prev) => {
                          if (!prev?.tourPersonnel) return prev;
                          return {
                            ...prev,
                            tourPersonnel: prev.tourPersonnel.map((r) => (r.id === next.id ? next : r)),
                          };
                        });
                      }}
                      onRemoved={() => {
                        setPerson((prev) => {
                          if (!prev?.tourPersonnel) return prev;
                          return {
                            ...prev,
                            tourPersonnel: prev.tourPersonnel.filter((r) => r.id !== tp.id),
                          };
                        });
                      }}
                    />
                  ))
                )}
              </div>
            </Section>
            <Section title="Notes">
              <textarea className={cn(IC, 'min-h-24')} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" />
            </Section>
            <Section title="Activity">
              <p className="text-xs text-lp-text-tertiary">Audit log placeholder for later prompt.</p>
            </Section>
          </>
        )}
      </div>
    </SlideOver>
  );
}

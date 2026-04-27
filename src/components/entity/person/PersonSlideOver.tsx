// TODO(UX13): refactor to use <SlideOver> primitive from src/components/shell/SlideOver.tsx.
//   Currently rolls its own chrome (backdrop / aside / header / footer). Functionally OK but
//   skips focus trap, mobile bottom-sheet, and standard animations. UX13 (list pages re-skin)
//   will sweep this when entity surfaces touch DataTable + slide-over.

'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Loader2, X } from 'lucide-react';
import { getPersonById, updatePerson } from '@/lib/api/persons';
import type { Person } from '@/lib/types/person';
import { cn } from '@/lib/utils';

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
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} aria-hidden />
      <aside className="fixed right-0 top-0 z-50 h-full w-full max-w-2xl border-l border-lp-border bg-lp-bg shadow-2xl">
        <header className="flex items-center justify-between border-b border-lp-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-lp-text">{person?.preferredName ?? person?.fullName ?? 'Person'}</h2>
            <p className="text-xs text-lp-text-secondary">Canonical person record</p>
          </div>
          <button type="button" className="rounded p-1 text-lp-text-tertiary hover:text-lp-text" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="h-[calc(100%-7.5rem)] space-y-4 overflow-y-auto px-4 py-4">
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
              {/* TODO(UX13): inline edit role/employment_type/rate_amount/rate_currency/rate_period/dates per tour_personnel row. Currently read-only. Needs PATCH /api/tour-personnel/[id] endpoint + per-row local state. */}
              <Section title="Tours">
                <div className="space-y-2">
                  {(person?.tourPersonnel ?? []).length === 0 ? (
                    <p className="text-xs text-lp-text-tertiary">No tour assignments.</p>
                  ) : (
                    (person?.tourPersonnel ?? []).map((tp) => (
                      <div key={tp.id} className="rounded border border-lp-border bg-lp-surface px-2 py-1.5 text-xs text-lp-text-secondary">
                        <p className="font-medium text-lp-text">{tp.tourName ?? tp.tourId}</p>
                        <p>
                          Role: {tp.role} · Rate: {tp.rateAmount ?? 0} {tp.rateCurrency}
                        </p>
                        <p className="text-lp-text-tertiary">Editing role/rate here is tour-scoped only.</p>
                      </div>
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
        <footer className="flex items-center justify-end gap-2 border-t border-lp-border px-4 py-3">
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
        </footer>
      </aside>
    </>
  );
}

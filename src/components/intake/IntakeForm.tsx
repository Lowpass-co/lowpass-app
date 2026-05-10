'use client';

/* ============================================
   LOWPASS — <IntakeForm> (Sprint 11 §2)

   Public-form client component for /intake/[token]. Captures
   the FULL multi-of-each personnel schema:

     - Identity        : date of birth, pronouns
     - Contact         : home airport, allergies (free text →
                         extended_profile.health.allergies_medicine)
     - Passports       : multi-entry (country / number /
                         given_names / surname /
                         date_of_issue / date_of_expiry /
                         place_of_birth)
     - Visas           : multi-entry (country / type /
                         visa_number / valid_from / valid_to /
                         multi_entry checkbox / notes)
     - Emergency       : multi-entry (name / relationship /
                         phone / email)
     - Frequent flier  : multi-entry (airline / member_number /
                         tier dropdown)
     - Dietary         : multi-entry (type dropdown + notes)
     - Merch sizes     : multi-entry (garment dropdown + size
                         free-text)

   On submit, POSTs to /api/intake/[token]/submit with a
   PersonnelExtendedProfile-shaped payload. The server-side
   submit_personnel_intake RPC merges into the existing
   extended_profile so admin-prefilled fields aren't
   overwritten.

   Required fields are minimal — let the recipient skip what
   they don't have ready. Admin can fill in gaps later via
   the personnel detail slide-over.
   ============================================ */

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  padding: 'var(--lp-space-2) var(--lp-space-3)',
  fontSize: 'var(--lp-text-sm)',
  color: 'var(--lp-text)',
  background: 'var(--lp-bg)',
  border: '1px solid var(--lp-border-strong)',
  borderRadius: 'var(--lp-radius-md)',
  outline: 'none',
};

const LABEL_STYLE: React.CSSProperties = {
  display: 'block',
  marginBottom: 'var(--lp-space-1)',
  fontSize: 'var(--lp-text-xs)',
  fontWeight: 600,
  color: 'var(--lp-text)',
};

const SECTION_STYLE: React.CSSProperties = {
  marginTop: 'var(--lp-space-5)',
  paddingTop: 'var(--lp-space-3)',
  borderTop: '1px solid var(--lp-border)',
};

interface IntakeFormProps {
  token: string;
}

interface PassportEntry {
  country: string;
  number: string;
  given_names: string;
  surname: string;
  date_of_issue: string;
  date_of_expiry: string;
  place_of_birth: string;
}
interface VisaEntry {
  country: string;
  type: string;
  visa_number: string;
  valid_from: string;
  valid_to: string;
  multi_entry: boolean;
  notes: string;
}
interface EmergencyEntry {
  name: string;
  relationship: string;
  phone: string;
  email: string;
}
type FlierTier = '' | 'basic' | 'silver' | 'gold' | 'platinum';
interface FlierEntry {
  airline: string;
  member_number: string;
  tier: FlierTier;
}
type DietaryType = 'vegetarian' | 'vegan' | 'gluten_free' | 'kosher' | 'halal' | 'custom';
interface DietaryEntry {
  type: DietaryType;
  notes: string;
}
type Garment = 't_shirt' | 'hoodie' | 'jacket' | 'pants' | 'shoes';
interface MerchEntry {
  garment: Garment;
  size: string;
}

const FLIER_TIERS: ReadonlyArray<{ value: Exclude<FlierTier, ''>; label: string }> = [
  { value: 'basic', label: 'Basic' },
  { value: 'silver', label: 'Silver' },
  { value: 'gold', label: 'Gold' },
  { value: 'platinum', label: 'Platinum' },
];

const DIETARY_TYPES: ReadonlyArray<{ value: DietaryType; label: string }> = [
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'gluten_free', label: 'Gluten-free' },
  { value: 'kosher', label: 'Kosher' },
  { value: 'halal', label: 'Halal' },
  { value: 'custom', label: 'Other / custom' },
];

const GARMENTS: ReadonlyArray<{ value: Garment; label: string }> = [
  { value: 't_shirt', label: 'T-shirt' },
  { value: 'hoodie', label: 'Hoodie' },
  { value: 'jacket', label: 'Jacket' },
  { value: 'pants', label: 'Pants' },
  { value: 'shoes', label: 'Shoes' },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function emptyPassport(): PassportEntry {
  return {
    country: '', number: '', given_names: '', surname: '',
    date_of_issue: '', date_of_expiry: '', place_of_birth: '',
  };
}
function emptyVisa(): VisaEntry {
  return {
    country: '', type: '', visa_number: '',
    valid_from: '', valid_to: '', multi_entry: false, notes: '',
  };
}
function emptyEmergency(): EmergencyEntry {
  return { name: '', relationship: '', phone: '', email: '' };
}
function emptyFlier(): FlierEntry {
  return { airline: '', member_number: '', tier: '' };
}
function emptyDietary(): DietaryEntry {
  return { type: 'vegetarian', notes: '' };
}
function emptyMerch(): MerchEntry {
  return { garment: 't_shirt', size: '' };
}

export function IntakeForm({ token }: IntakeFormProps) {
  // Identity / contact (single fields)
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [pronouns, setPronouns] = useState('');
  const [homeAirport, setHomeAirport] = useState('');
  const [allergies, setAllergies] = useState('');

  // Multi-of-each lists. Passports + emergencies seed with
  // one row visible (most common case); the others start
  // empty so the form looks short.
  const [passports, setPassports] = useState<PassportEntry[]>([emptyPassport()]);
  const [visas, setVisas] = useState<VisaEntry[]>([]);
  const [emergencies, setEmergencies] = useState<EmergencyEntry[]>([emptyEmergency()]);
  const [fliers, setFliers] = useState<FlierEntry[]>([]);
  const [dietary, setDietary] = useState<DietaryEntry[]>([]);
  const [merch, setMerch] = useState<MerchEntry[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    /* Validate optional emails when present (regex). */
    for (const ec of emergencies) {
      if (ec.email && !EMAIL_RE.test(ec.email.trim())) {
        setError(`Emergency contact email "${ec.email}" doesn't look right.`);
        setSubmitting(false);
        return;
      }
    }

    /* Build a partial PersonnelExtendedProfile. Empty entries
       are omitted so the server-side merge doesn't overwrite
       existing fields with blanks. */
    const payload: Record<string, unknown> = {};

    if (dateOfBirth) payload.date_of_birth = dateOfBirth;
    if (pronouns.trim()) payload.pronouns = pronouns.trim();
    if (homeAirport.trim()) payload.home_airport = homeAirport.trim();
    /* Allergies free-text maps to
       extended_profile.health.allergies_medicine — the same
       key the personnel detail slide-over's Health/Medical
       section reads. */
    if (allergies.trim()) {
      payload.health = { allergies_medicine: allergies.trim() };
    }

    const cleanedPassports = passports
      .map((p) => {
        const out: Record<string, string> = {};
        if (p.country.trim()) out.country = p.country.trim();
        if (p.number.trim()) out.number = p.number.trim();
        if (p.given_names.trim()) out.given_names = p.given_names.trim();
        if (p.surname.trim()) out.surname = p.surname.trim();
        if (p.date_of_issue) out.date_of_issue = p.date_of_issue;
        if (p.date_of_expiry) out.date_of_expiry = p.date_of_expiry;
        if (p.place_of_birth.trim()) out.place_of_birth = p.place_of_birth.trim();
        return out;
      })
      .filter((p) => Object.keys(p).length > 0);
    if (cleanedPassports.length > 0) payload.passports_v2 = cleanedPassports;

    const cleanedVisas = visas
      .map((v) => {
        const out: Record<string, unknown> = {};
        if (v.country.trim()) out.country = v.country.trim();
        if (v.type.trim()) out.type = v.type.trim();
        if (v.visa_number.trim()) out.visa_number = v.visa_number.trim();
        if (v.valid_from) out.valid_from = v.valid_from;
        if (v.valid_to) out.valid_to = v.valid_to;
        if (v.multi_entry) out.multi_entry = true;
        if (v.notes.trim()) out.notes = v.notes.trim();
        return out;
      })
      .filter((v) => Object.keys(v).length > 0);
    if (cleanedVisas.length > 0) payload.visas = cleanedVisas;

    const cleanedEmergencies = emergencies
      .map((c) => {
        const out: Record<string, string> = {};
        if (c.name.trim()) out.name = c.name.trim();
        if (c.relationship.trim()) out.relationship = c.relationship.trim();
        if (c.phone.trim()) out.phone = c.phone.trim();
        if (c.email.trim()) out.email = c.email.trim();
        return out;
      })
      .filter((c) => !!c.name);
    if (cleanedEmergencies.length > 0) payload.emergency_contacts = cleanedEmergencies;

    const cleanedFliers = fliers
      .map((f) => {
        const out: Record<string, string> = {};
        if (f.airline.trim()) out.airline = f.airline.trim();
        if (f.member_number.trim()) out.member_number = f.member_number.trim();
        if (f.tier) out.tier = f.tier;
        return out;
      })
      .filter((f) => !!f.airline || !!f.member_number);
    if (cleanedFliers.length > 0) payload.frequent_flier = cleanedFliers;

    const cleanedDietary = dietary.map((d) => {
      const out: Record<string, string> = { type: d.type };
      if (d.notes.trim()) out.notes = d.notes.trim();
      return out;
    });
    if (cleanedDietary.length > 0) payload.dietary = cleanedDietary;

    const cleanedMerch = merch
      .map((m) => ({ garment: m.garment, size: m.size.trim() }))
      .filter((m) => !!m.size);
    if (cleanedMerch.length > 0) payload.merch_sizes = cleanedMerch;

    try {
      const res = await fetch(`/api/intake/${encodeURIComponent(token)}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(body?.error ?? 'Could not submit form.');
        return;
      }
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div
        role="status"
        style={{
          padding: 'var(--lp-space-4)',
          background: 'color-mix(in srgb, var(--color-lp-success, #1f8a4c) 8%, transparent)',
          border: '1px solid color-mix(in srgb, var(--color-lp-success, #1f8a4c) 40%, transparent)',
          borderRadius: 'var(--lp-radius-md)',
          fontSize: 'var(--lp-text-sm)',
          color: 'var(--lp-text)',
        }}
      >
        Thanks — your details have been received. You can close
        this window.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* IDENTITY ----------------------------------------- */}
      <h2 style={{ margin: 0, fontSize: 'var(--lp-text-base)', fontWeight: 700 }}>
        Identity
      </h2>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 'var(--lp-space-2)',
          marginTop: 'var(--lp-space-2)',
        }}
      >
        <div>
          <label htmlFor="lp-intake-dob" style={LABEL_STYLE}>Date of birth</label>
          <input id="lp-intake-dob" type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} style={INPUT_STYLE} />
        </div>
        <div>
          <label htmlFor="lp-intake-pronouns" style={LABEL_STYLE}>Pronouns</label>
          <input id="lp-intake-pronouns" type="text" value={pronouns} onChange={(e) => setPronouns(e.target.value)} placeholder="she/her, they/them, etc." style={INPUT_STYLE} />
        </div>
      </div>

      {/* CONTACT ------------------------------------------ */}
      <h2 style={{ ...SECTION_STYLE, fontSize: 'var(--lp-text-base)', fontWeight: 700 }}>
        Contact
      </h2>
      <div style={{ marginTop: 'var(--lp-space-2)' }}>
        <label htmlFor="lp-intake-airport" style={LABEL_STYLE}>Home airport</label>
        <input id="lp-intake-airport" type="text" value={homeAirport} onChange={(e) => setHomeAirport(e.target.value)} placeholder="e.g. LHR / JFK / LAX" style={INPUT_STYLE} />
      </div>
      <div style={{ marginTop: 'var(--lp-space-3)' }}>
        <label htmlFor="lp-intake-allergies" style={LABEL_STYLE}>Allergies (medication or otherwise)</label>
        <textarea
          id="lp-intake-allergies"
          value={allergies}
          onChange={(e) => setAllergies(e.target.value)}
          placeholder="e.g. severe nut allergy, penicillin"
          rows={2}
          style={{ ...INPUT_STYLE, resize: 'vertical' }}
        />
      </div>

      {/* PASSPORTS ---------------------------------------- */}
      <h2 style={{ ...SECTION_STYLE, fontSize: 'var(--lp-text-base)', fontWeight: 700 }}>
        Passports
      </h2>
      {passports.map((p, i) => (
        <PassportRow
          key={i}
          value={p}
          onChange={(next) => setPassports((arr) => arr.map((row, idx) => (idx === i ? next : row)))}
          onRemove={passports.length > 1 ? () => setPassports((arr) => arr.filter((_, idx) => idx !== i)) : undefined}
        />
      ))}
      <AddRowButton label="Add passport" onClick={() => setPassports((arr) => [...arr, emptyPassport()])} />

      {/* VISAS -------------------------------------------- */}
      <h2 style={{ ...SECTION_STYLE, fontSize: 'var(--lp-text-base)', fontWeight: 700 }}>
        Visas
      </h2>
      {visas.length === 0 ? (
        <p style={{ marginTop: 'var(--lp-space-2)', fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-tertiary)', fontStyle: 'italic' }}>
          No visas? Skip this section.
        </p>
      ) : null}
      {visas.map((v, i) => (
        <VisaRow
          key={i}
          value={v}
          onChange={(next) => setVisas((arr) => arr.map((row, idx) => (idx === i ? next : row)))}
          onRemove={() => setVisas((arr) => arr.filter((_, idx) => idx !== i))}
        />
      ))}
      <AddRowButton label="Add visa" onClick={() => setVisas((arr) => [...arr, emptyVisa()])} />

      {/* EMERGENCY CONTACTS ------------------------------- */}
      <h2 style={{ ...SECTION_STYLE, fontSize: 'var(--lp-text-base)', fontWeight: 700 }}>
        Emergency contacts
      </h2>
      {emergencies.map((c, i) => (
        <EmergencyRow
          key={i}
          value={c}
          onChange={(next) => setEmergencies((arr) => arr.map((row, idx) => (idx === i ? next : row)))}
          onRemove={emergencies.length > 1 ? () => setEmergencies((arr) => arr.filter((_, idx) => idx !== i)) : undefined}
        />
      ))}
      <AddRowButton label="Add emergency contact" onClick={() => setEmergencies((arr) => [...arr, emptyEmergency()])} />

      {/* FREQUENT FLIER ----------------------------------- */}
      <h2 style={{ ...SECTION_STYLE, fontSize: 'var(--lp-text-base)', fontWeight: 700 }}>
        Frequent flier
      </h2>
      {fliers.length === 0 ? (
        <p style={{ marginTop: 'var(--lp-space-2)', fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-tertiary)', fontStyle: 'italic' }}>
          No programmes? Skip this section.
        </p>
      ) : null}
      {fliers.map((f, i) => (
        <FlierRow
          key={i}
          value={f}
          onChange={(next) => setFliers((arr) => arr.map((row, idx) => (idx === i ? next : row)))}
          onRemove={() => setFliers((arr) => arr.filter((_, idx) => idx !== i))}
        />
      ))}
      <AddRowButton label="Add airline" onClick={() => setFliers((arr) => [...arr, emptyFlier()])} />

      {/* DIETARY ------------------------------------------ */}
      <h2 style={{ ...SECTION_STYLE, fontSize: 'var(--lp-text-base)', fontWeight: 700 }}>
        Dietary
      </h2>
      {dietary.length === 0 ? (
        <p style={{ marginTop: 'var(--lp-space-2)', fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-tertiary)', fontStyle: 'italic' }}>
          No dietary requirements? Skip.
        </p>
      ) : null}
      {dietary.map((d, i) => (
        <DietaryRow
          key={i}
          value={d}
          onChange={(next) => setDietary((arr) => arr.map((row, idx) => (idx === i ? next : row)))}
          onRemove={() => setDietary((arr) => arr.filter((_, idx) => idx !== i))}
        />
      ))}
      <AddRowButton label="Add dietary requirement" onClick={() => setDietary((arr) => [...arr, emptyDietary()])} />

      {/* MERCH SIZES -------------------------------------- */}
      <h2 style={{ ...SECTION_STYLE, fontSize: 'var(--lp-text-base)', fontWeight: 700 }}>
        Merch sizes
      </h2>
      {merch.length === 0 ? (
        <p style={{ marginTop: 'var(--lp-space-2)', fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-tertiary)', fontStyle: 'italic' }}>
          Add as many as you like — t-shirt, hoodie, shoes, etc.
        </p>
      ) : null}
      {merch.map((m, i) => (
        <MerchRow
          key={i}
          value={m}
          onChange={(next) => setMerch((arr) => arr.map((row, idx) => (idx === i ? next : row)))}
          onRemove={() => setMerch((arr) => arr.filter((_, idx) => idx !== i))}
        />
      ))}
      <AddRowButton label="Add size" onClick={() => setMerch((arr) => [...arr, emptyMerch()])} />

      {error ? (
        <div
          role="alert"
          style={{
            marginTop: 'var(--lp-space-4)',
            padding: 'var(--lp-space-2) var(--lp-space-3)',
            fontSize: 'var(--lp-text-sm)',
            color: 'var(--color-lp-error)',
            background: 'color-mix(in srgb, var(--color-lp-error) 8%, transparent)',
            border: '1px solid color-mix(in srgb, var(--color-lp-error) 30%, transparent)',
            borderRadius: 'var(--lp-radius-md)',
          }}
        >
          {error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        style={{
          marginTop: 'var(--lp-space-5)',
          width: '100%',
          padding: 'var(--lp-space-3) var(--lp-space-4)',
          fontSize: 'var(--lp-text-sm)',
          fontWeight: 700,
          color: 'var(--lp-text-inverse)',
          background: 'var(--color-lp-orange)',
          border: '1px solid transparent',
          borderRadius: 'var(--lp-radius-md)',
          cursor: submitting ? 'not-allowed' : 'pointer',
          opacity: submitting ? 0.7 : 1,
        }}
      >
        {submitting ? 'Submitting…' : 'Submit'}
      </button>
    </form>
  );
}

/* ============================================
   Inline row editors. Each receives value + onChange + an
   optional onRemove — when omitted, the remove button is
   hidden (used to keep at least one passport / emergency
   contact visible at all times).
   ============================================ */

function RowFrame({ children, onRemove }: { children: React.ReactNode; onRemove?: () => void }) {
  return (
    <div
      style={{
        position: 'relative',
        marginTop: 'var(--lp-space-3)',
        padding: 'var(--lp-space-3)',
        background: 'var(--lp-panel)',
        border: '1px solid var(--lp-border)',
        borderRadius: 'var(--lp-radius-md)',
      }}
    >
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove entry"
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            padding: 4,
            color: 'var(--color-lp-error)',
            background: 'transparent',
            border: 'none',
            borderRadius: 'var(--lp-radius-sm)',
            cursor: 'pointer',
          }}
        >
          <Trash2 size={14} strokeWidth={2.4} />
        </button>
      ) : null}
      {children}
    </div>
  );
}

function AddRowButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        marginTop: 'var(--lp-space-2)',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '6px 12px',
        fontSize: 'var(--lp-text-xs)',
        fontWeight: 600,
        color: 'var(--color-lp-orange)',
        background: 'transparent',
        border: '1px dashed color-mix(in srgb, var(--color-lp-orange) 40%, transparent)',
        borderRadius: 'var(--lp-radius-md)',
        cursor: 'pointer',
      }}
    >
      <Plus size={12} strokeWidth={2.4} />
      {label}
    </button>
  );
}

function PassportRow({ value, onChange, onRemove }: { value: PassportEntry; onChange: (next: PassportEntry) => void; onRemove?: () => void }) {
  return (
    <RowFrame onRemove={onRemove}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--lp-space-2)' }}>
        <div>
          <label style={LABEL_STYLE}>Country</label>
          <input type="text" value={value.country} onChange={(e) => onChange({ ...value, country: e.target.value })} style={INPUT_STYLE} placeholder="UK / US / etc." />
        </div>
        <div>
          <label style={LABEL_STYLE}>Passport #</label>
          <input type="text" value={value.number} onChange={(e) => onChange({ ...value, number: e.target.value })} style={INPUT_STYLE} />
        </div>
        <div>
          <label style={LABEL_STYLE}>Given names</label>
          <input type="text" value={value.given_names} onChange={(e) => onChange({ ...value, given_names: e.target.value })} style={INPUT_STYLE} />
        </div>
        <div>
          <label style={LABEL_STYLE}>Surname</label>
          <input type="text" value={value.surname} onChange={(e) => onChange({ ...value, surname: e.target.value })} style={INPUT_STYLE} />
        </div>
        <div>
          <label style={LABEL_STYLE}>Date of issue</label>
          <input type="date" value={value.date_of_issue} onChange={(e) => onChange({ ...value, date_of_issue: e.target.value })} style={INPUT_STYLE} />
        </div>
        <div>
          <label style={LABEL_STYLE}>Date of expiry</label>
          <input type="date" value={value.date_of_expiry} onChange={(e) => onChange({ ...value, date_of_expiry: e.target.value })} style={INPUT_STYLE} />
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <label style={LABEL_STYLE}>Place of birth</label>
          <input type="text" value={value.place_of_birth} onChange={(e) => onChange({ ...value, place_of_birth: e.target.value })} style={INPUT_STYLE} />
        </div>
      </div>
    </RowFrame>
  );
}

function VisaRow({ value, onChange, onRemove }: { value: VisaEntry; onChange: (next: VisaEntry) => void; onRemove: () => void }) {
  return (
    <RowFrame onRemove={onRemove}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--lp-space-2)' }}>
        <div>
          <label style={LABEL_STYLE}>Country</label>
          <input type="text" value={value.country} onChange={(e) => onChange({ ...value, country: e.target.value })} style={INPUT_STYLE} />
        </div>
        <div>
          <label style={LABEL_STYLE}>Type</label>
          <input type="text" value={value.type} onChange={(e) => onChange({ ...value, type: e.target.value })} style={INPUT_STYLE} placeholder="O-1 / Schengen / etc." />
        </div>
        <div>
          <label style={LABEL_STYLE}>Visa #</label>
          <input type="text" value={value.visa_number} onChange={(e) => onChange({ ...value, visa_number: e.target.value })} style={INPUT_STYLE} />
        </div>
        <div>
          <label style={{ ...LABEL_STYLE, display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={value.multi_entry}
              onChange={(e) => onChange({ ...value, multi_entry: e.target.checked })}
              style={{ accentColor: 'var(--color-lp-orange)' }}
            />
            Multi-entry
          </label>
        </div>
        <div>
          <label style={LABEL_STYLE}>Valid from</label>
          <input type="date" value={value.valid_from} onChange={(e) => onChange({ ...value, valid_from: e.target.value })} style={INPUT_STYLE} />
        </div>
        <div>
          <label style={LABEL_STYLE}>Valid to</label>
          <input type="date" value={value.valid_to} onChange={(e) => onChange({ ...value, valid_to: e.target.value })} style={INPUT_STYLE} />
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <label style={LABEL_STYLE}>Notes</label>
          <textarea
            value={value.notes}
            onChange={(e) => onChange({ ...value, notes: e.target.value })}
            rows={2}
            style={{ ...INPUT_STYLE, resize: 'vertical' }}
          />
        </div>
      </div>
    </RowFrame>
  );
}

function EmergencyRow({ value, onChange, onRemove }: { value: EmergencyEntry; onChange: (next: EmergencyEntry) => void; onRemove?: () => void }) {
  return (
    <RowFrame onRemove={onRemove}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--lp-space-2)' }}>
        <div>
          <label style={LABEL_STYLE}>Name</label>
          <input type="text" value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} style={INPUT_STYLE} />
        </div>
        <div>
          <label style={LABEL_STYLE}>Relationship</label>
          <input type="text" value={value.relationship} onChange={(e) => onChange({ ...value, relationship: e.target.value })} placeholder="Partner / Parent / etc." style={INPUT_STYLE} />
        </div>
        <div>
          <label style={LABEL_STYLE}>Phone</label>
          <input type="tel" value={value.phone} onChange={(e) => onChange({ ...value, phone: e.target.value })} style={INPUT_STYLE} />
        </div>
        <div>
          <label style={LABEL_STYLE}>Email (optional)</label>
          <input type="email" value={value.email} onChange={(e) => onChange({ ...value, email: e.target.value })} style={INPUT_STYLE} />
        </div>
      </div>
    </RowFrame>
  );
}

function FlierRow({ value, onChange, onRemove }: { value: FlierEntry; onChange: (next: FlierEntry) => void; onRemove: () => void }) {
  return (
    <RowFrame onRemove={onRemove}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 'var(--lp-space-2)' }}>
        <div>
          <label style={LABEL_STYLE}>Airline</label>
          <input type="text" value={value.airline} onChange={(e) => onChange({ ...value, airline: e.target.value })} style={INPUT_STYLE} placeholder="BA / Delta / etc." />
        </div>
        <div>
          <label style={LABEL_STYLE}>Member #</label>
          <input type="text" value={value.member_number} onChange={(e) => onChange({ ...value, member_number: e.target.value })} style={INPUT_STYLE} />
        </div>
        <div>
          <label style={LABEL_STYLE}>Tier</label>
          <select
            value={value.tier}
            onChange={(e) => onChange({ ...value, tier: e.target.value as FlierTier })}
            style={INPUT_STYLE}
          >
            <option value="">—</option>
            {FLIER_TIERS.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
      </div>
    </RowFrame>
  );
}

function DietaryRow({ value, onChange, onRemove }: { value: DietaryEntry; onChange: (next: DietaryEntry) => void; onRemove: () => void }) {
  return (
    <RowFrame onRemove={onRemove}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--lp-space-2)' }}>
        <div>
          <label style={LABEL_STYLE}>Type</label>
          <select
            value={value.type}
            onChange={(e) => onChange({ ...value, type: e.target.value as DietaryType })}
            style={INPUT_STYLE}
          >
            {DIETARY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={LABEL_STYLE}>Notes</label>
          <input type="text" value={value.notes} onChange={(e) => onChange({ ...value, notes: e.target.value })} placeholder="e.g. severe nut allergy" style={INPUT_STYLE} />
        </div>
      </div>
    </RowFrame>
  );
}

function MerchRow({ value, onChange, onRemove }: { value: MerchEntry; onChange: (next: MerchEntry) => void; onRemove: () => void }) {
  return (
    <RowFrame onRemove={onRemove}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--lp-space-2)' }}>
        <div>
          <label style={LABEL_STYLE}>Garment</label>
          <select
            value={value.garment}
            onChange={(e) => onChange({ ...value, garment: e.target.value as Garment })}
            style={INPUT_STYLE}
          >
            {GARMENTS.map((g) => (
              <option key={g.value} value={g.value}>{g.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={LABEL_STYLE}>Size</label>
          <input type="text" value={value.size} onChange={(e) => onChange({ ...value, size: e.target.value })} placeholder="XS / S / M / L / XL / 30 / 10" style={INPUT_STYLE} />
        </div>
      </div>
    </RowFrame>
  );
}

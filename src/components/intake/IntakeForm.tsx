'use client';

/* ============================================
   LOWPASS — <IntakeForm> (Sprint 10 §2.4)

   Public-form client component for /intake/[token]. Captures
   the highest-value v2 personnel fields:

     - Passport (country / number / given names / surname / dates)
     - Emergency contact (name / relationship / phone / email)
     - Dietary requirement (custom string)
     - Merch size (free-form size value, t-shirt category)

   On submit, POSTs to /api/intake/[token]/submit with a
   PersonnelExtendedProfile-shaped payload. The server-side RPC
   merges into the existing extended_profile so admin-prefilled
   fields aren't overwritten.

   Other v2 fields (visas, frequent flier, multiple
   passports / emergency contacts / merch sizes) are kept out of
   v1 to keep the form short. The operator can edit later.
   ============================================ */

import { useState } from 'react';

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
  marginTop: 'var(--lp-space-4)',
  paddingTop: 'var(--lp-space-3)',
  borderTop: '1px solid var(--lp-border)',
};

interface IntakeFormProps {
  token: string;
}

export function IntakeForm({ token }: IntakeFormProps) {
  const [passportCountry, setPassportCountry] = useState('');
  const [passportNumber, setPassportNumber] = useState('');
  const [passportGiven, setPassportGiven] = useState('');
  const [passportSurname, setPassportSurname] = useState('');
  const [passportIssue, setPassportIssue] = useState('');
  const [passportExpiry, setPassportExpiry] = useState('');

  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyRel, setEmergencyRel] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [emergencyEmail, setEmergencyEmail] = useState('');

  const [dietary, setDietary] = useState('');
  const [tshirtSize, setTshirtSize] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    /* Build a partial PersonnelExtendedProfile. Only emit fields
       the visitor actually filled in — empty string ⇒ omit from
       payload so the server-side merge doesn't overwrite an
       existing value with empty. */
    type Payload = Record<string, unknown>;
    const payload: Payload = {};

    const passport: Record<string, string> = {};
    if (passportCountry.trim()) passport.country = passportCountry.trim();
    if (passportNumber.trim()) passport.number = passportNumber.trim();
    if (passportGiven.trim()) passport.given_names = passportGiven.trim();
    if (passportSurname.trim()) passport.surname = passportSurname.trim();
    if (passportIssue) passport.date_of_issue = passportIssue;
    if (passportExpiry) passport.date_of_expiry = passportExpiry;
    if (Object.keys(passport).length > 0) {
      payload.passports_v2 = [passport];
    }

    const emergency: Record<string, string> = {};
    if (emergencyName.trim()) emergency.name = emergencyName.trim();
    if (emergencyRel.trim()) emergency.relationship = emergencyRel.trim();
    if (emergencyPhone.trim()) emergency.phone = emergencyPhone.trim();
    if (emergencyEmail.trim()) emergency.email = emergencyEmail.trim();
    if (Object.keys(emergency).length > 0) {
      payload.emergency_contacts = [emergency];
    }

    if (dietary.trim()) {
      payload.dietary = [{ type: 'custom', notes: dietary.trim() }];
    }
    if (tshirtSize.trim()) {
      payload.merch_sizes = [{ garment: 't_shirt', size: tshirtSize.trim() }];
    }

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
      <h2 style={{ margin: 0, fontSize: 'var(--lp-text-base)', fontWeight: 700 }}>
        Passport (primary)
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
          <label htmlFor="lp-intake-pp-country" style={LABEL_STYLE}>Country</label>
          <input id="lp-intake-pp-country" type="text" value={passportCountry} onChange={(e) => setPassportCountry(e.target.value)} style={INPUT_STYLE} />
        </div>
        <div>
          <label htmlFor="lp-intake-pp-number" style={LABEL_STYLE}>Passport #</label>
          <input id="lp-intake-pp-number" type="text" value={passportNumber} onChange={(e) => setPassportNumber(e.target.value)} style={INPUT_STYLE} />
        </div>
        <div>
          <label htmlFor="lp-intake-pp-given" style={LABEL_STYLE}>Given names</label>
          <input id="lp-intake-pp-given" type="text" value={passportGiven} onChange={(e) => setPassportGiven(e.target.value)} style={INPUT_STYLE} />
        </div>
        <div>
          <label htmlFor="lp-intake-pp-surname" style={LABEL_STYLE}>Surname</label>
          <input id="lp-intake-pp-surname" type="text" value={passportSurname} onChange={(e) => setPassportSurname(e.target.value)} style={INPUT_STYLE} />
        </div>
        <div>
          <label htmlFor="lp-intake-pp-issue" style={LABEL_STYLE}>Date of issue</label>
          <input id="lp-intake-pp-issue" type="date" value={passportIssue} onChange={(e) => setPassportIssue(e.target.value)} style={INPUT_STYLE} />
        </div>
        <div>
          <label htmlFor="lp-intake-pp-expiry" style={LABEL_STYLE}>Date of expiry</label>
          <input id="lp-intake-pp-expiry" type="date" value={passportExpiry} onChange={(e) => setPassportExpiry(e.target.value)} style={INPUT_STYLE} />
        </div>
      </div>

      <h2 style={{ ...SECTION_STYLE, fontSize: 'var(--lp-text-base)', fontWeight: 700 }}>
        Emergency contact
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
          <label htmlFor="lp-intake-em-name" style={LABEL_STYLE}>Name</label>
          <input id="lp-intake-em-name" type="text" value={emergencyName} onChange={(e) => setEmergencyName(e.target.value)} style={INPUT_STYLE} />
        </div>
        <div>
          <label htmlFor="lp-intake-em-rel" style={LABEL_STYLE}>Relationship</label>
          <input id="lp-intake-em-rel" type="text" value={emergencyRel} onChange={(e) => setEmergencyRel(e.target.value)} style={INPUT_STYLE} placeholder="e.g. Partner / Parent" />
        </div>
        <div>
          <label htmlFor="lp-intake-em-phone" style={LABEL_STYLE}>Phone</label>
          <input id="lp-intake-em-phone" type="tel" value={emergencyPhone} onChange={(e) => setEmergencyPhone(e.target.value)} style={INPUT_STYLE} />
        </div>
        <div>
          <label htmlFor="lp-intake-em-email" style={LABEL_STYLE}>Email (optional)</label>
          <input id="lp-intake-em-email" type="email" value={emergencyEmail} onChange={(e) => setEmergencyEmail(e.target.value)} style={INPUT_STYLE} />
        </div>
      </div>

      <h2 style={{ ...SECTION_STYLE, fontSize: 'var(--lp-text-base)', fontWeight: 700 }}>
        Touring extras
      </h2>
      <div style={{ marginTop: 'var(--lp-space-2)' }}>
        <label htmlFor="lp-intake-dietary" style={LABEL_STYLE}>Dietary requirements / allergies</label>
        <input id="lp-intake-dietary" type="text" value={dietary} onChange={(e) => setDietary(e.target.value)} style={INPUT_STYLE} placeholder="e.g. Severe nut allergy" />
      </div>
      <div style={{ marginTop: 'var(--lp-space-3)' }}>
        <label htmlFor="lp-intake-tshirt" style={LABEL_STYLE}>T-shirt size</label>
        <input id="lp-intake-tshirt" type="text" value={tshirtSize} onChange={(e) => setTshirtSize(e.target.value)} style={INPUT_STYLE} placeholder="e.g. M / L / XL" />
      </div>

      {error ? (
        <div
          role="alert"
          style={{
            marginTop: 'var(--lp-space-3)',
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
          marginTop: 'var(--lp-space-4)',
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

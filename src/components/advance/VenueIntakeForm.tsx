'use client';

/* ============================================
   LOWPASS — Venue advance-intake form (T3.2)

   Rendered on the public /advance-intake/[token] page. Builds inputs
   from the schema the server derived from the show's advance template,
   collects the venue's answers, and POSTs them to
   /api/public/advance-intake/[token]/submit (which sanitises + merges
   them back into the TM's advance).

   Named VenueIntakeForm to stay distinct from the personnel-intake
   IntakeForm (@/components/intake/IntakeForm).
   ============================================ */

import { useEffect, useRef, useState } from 'react';
import { TechPackUpload } from '@/components/advance/TechPackUpload';
import { Send, CheckCircle2, MapPin, Calendar } from 'lucide-react';
import type { IntakeFormSchema, IntakeField, AdvanceData } from '@/lib/advance/intake';

interface ShowContext {
  venueName: string | null;
  city: string | null;
  address: string | null;
  dateLabel: string | null;
  tourName: string | null;
}

interface VenueIntakeFormProps {
  token: string;
  alreadySubmitted: boolean;
  show: ShowContext;
  schema: IntakeFormSchema;
  initialAnswers: AdvanceData;
  /** P7 Checkpoint B — prefill proposals: { sectionId: { fieldId: { value,
   *  provenance } } }. Rendered as confirm-or-correct suggestions; an unedited
   *  confirmed proposal submits as source='prefill'. */
  proposals?: Record<string, Record<string, { value: unknown; provenance: string }>>;
}

const cardStyle: React.CSSProperties = {
  borderRadius: 16,
  border: '1px solid var(--lp-border-strong)',
  background: 'var(--lp-surface)',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  // Checkpoint D — thumb-sized: taller tap target + 16px font (no iOS zoom).
  padding: '12px 14px',
  fontSize: 16,
  background: 'var(--lp-bg-deep)',
  color: 'var(--lp-text)',
  border: '1px solid var(--lp-border-strong)',
  borderRadius: 10,
  outline: 'none',
};

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return v.trim() === '';
  return false;
}

export function VenueIntakeForm({
  token,
  alreadySubmitted,
  show,
  schema,
  initialAnswers,
  proposals = {},
}: VenueIntakeFormProps) {
  const [answers, setAnswers] = useState<AdvanceData>(() => {
    const seeded: AdvanceData = JSON.parse(JSON.stringify(initialAnswers ?? {}));
    // Seed prefill proposals where the venue hasn't already answered.
    for (const [sid, fields] of Object.entries(proposals)) {
      for (const [fid, prop] of Object.entries(fields)) {
        if (isEmpty(seeded[sid]?.[fid])) (seeded[sid] ??= {})[fid] = prop.value;
      }
    }
    return seeded;
  });
  const [submitterName, setSubmitterName] = useState('');
  const [submitterEmail, setSubmitterEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setField = (sectionId: string, fieldId: string, value: unknown) => {
    setAnswers((prev) => ({
      ...prev,
      [sectionId]: { ...(prev[sectionId] ?? {}), [fieldId]: value },
    }));
  };

  // Checkpoint D — per-field autosave (DRAFT): answers persist as PENDING as they
  // type, without marking the link submitted (that's the final Finish). The
  // "saved" state is surfaced in the sticky progress bar — no submit anxiety.
  const [savedState, setSavedState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const firstRender = useRef(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSavedState('saving');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const prefill: Record<string, Record<string, string>> = {};
      for (const [sid, fields] of Object.entries(proposals)) {
        for (const [fid, prop] of Object.entries(fields)) {
          if (JSON.stringify(answers[sid]?.[fid]) === JSON.stringify(prop.value)) (prefill[sid] ??= {})[fid] = prop.provenance;
        }
      }
      void fetch(`/api/public/advance-intake/${token}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: answers, prefill, draft: true }),
      })
        .then((r) => setSavedState(r.ok ? 'saved' : 'idle'))
        .catch(() => setSavedState('idle'));
    }, 800);
    // proposals is a stable prop; re-running on `answers` is the intent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, token]);

  const missingRequired = (): string[] => {
    const missing: string[] = [];
    for (const section of schema.sections) {
      for (const field of section.fields) {
        if (field.required && isEmpty(answers[section.template_id]?.[field.id])) {
          missing.push(field.label);
        }
      }
    }
    return missing;
  };

  const handleSubmit = async () => {
    const missing = missingRequired();
    if (missing.length > 0) {
      setError(`Please complete the required field${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/advance-intake/${token}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: answers,
          // Confirmed-prefill: proposals still holding their suggested value
          // (unedited) submit as source='prefill' with their provenance.
          prefill: (() => {
            const out: Record<string, Record<string, string>> = {};
            for (const [sid, fields] of Object.entries(proposals)) {
              for (const [fid, prop] of Object.entries(fields)) {
                if (JSON.stringify(answers[sid]?.[fid]) === JSON.stringify(prop.value)) {
                  (out[sid] ??= {})[fid] = prop.provenance;
                }
              }
            }
            return out;
          })(),
          submitterName: submitterName || undefined,
          submitterEmail: submitterEmail || undefined,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? 'Could not submit. Please try again.');
      }
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="p-8 text-center" style={cardStyle}>
        <CheckCircle2
          className="mx-auto"
          size={40}
          style={{ color: 'var(--color-lp-status-complete)' }}
        />
        <h1
          className="font-display"
          style={{ marginTop: 12, fontSize: 22, fontWeight: 700, color: 'var(--lp-text)' }}
        >
          Thanks — your details are in
        </h1>
        <p style={{ marginTop: 8, fontSize: 14, color: 'var(--lp-text-secondary)' }}>
          {show.tourName ? `${show.tourName} has` : 'We have'} received your
          response. You can close this window.
        </p>
      </div>
    );
  }

  const titleLine = show.venueName || show.tourName || 'Advance request';
  const subParts = [show.city, show.dateLabel].filter(Boolean).join(' · ');

  // Checkpoint D — progress (answered / total fillable) for the sticky bar.
  const fillable = schema.sections.flatMap((s) => s.fields.map((f) => [s.template_id, f.id] as const));
  const answeredCount = fillable.filter(([sid, fid]) => !isEmpty(answers[sid]?.[fid])).length;
  const totalCount = fillable.length;
  const answeredInSection = (sid: string) => {
    const sec = schema.sections.find((s) => s.template_id === sid);
    return (sec?.fields ?? []).filter((f) => !isEmpty(answers[sid]?.[f.id])).length;
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Checkpoint D — sticky progress + surfaced autosave state. */}
      <div
        className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-b-xl px-4 py-2"
        style={{ background: 'var(--lp-bg-deep)', borderBottom: '1px solid var(--lp-border)' }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--lp-text)' }}>
            {answeredCount} of {totalCount} answered
          </div>
          <div style={{ marginTop: 4, height: 4, borderRadius: 2, background: 'var(--lp-border)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${totalCount ? Math.round((answeredCount / totalCount) * 100) : 0}%`, background: 'var(--color-lp-orange)', transition: 'width 200ms ease' }} />
          </div>
        </div>
        <div style={{ flexShrink: 0, fontSize: 12, color: savedState === 'saved' ? 'var(--color-lp-status-complete)' : 'var(--lp-text-tertiary)' }}>
          {savedState === 'saving' ? 'Saving…' : savedState === 'saved' ? '✓ Saved' : ''}
        </div>
      </div>
      {/* Header */}
      <div className="relative overflow-hidden p-6" style={cardStyle}>
        <div
          aria-hidden
          className="absolute left-0 top-0 h-full"
          style={{ width: 4, background: 'var(--color-lp-orange)' }}
        />
        {show.tourName ? (
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--color-lp-orange)',
            }}
          >
            {show.tourName} · Advance request
          </p>
        ) : null}
        <h1
          className="font-display"
          style={{ marginTop: 6, fontSize: 26, fontWeight: 700, color: 'var(--lp-text)' }}
        >
          {titleLine}
        </h1>
        {subParts ? (
          <p
            className="mt-1 flex items-center gap-2"
            style={{ fontSize: 13, color: 'var(--lp-text-secondary)' }}
          >
            <Calendar size={13} />
            {subParts}
          </p>
        ) : null}
        {show.address ? (
          <p
            className="mt-1 flex items-center gap-2"
            style={{ fontSize: 13, color: 'var(--lp-text-secondary)' }}
          >
            <MapPin size={13} />
            {show.address}
          </p>
        ) : null}
        <p style={{ marginTop: 12, fontSize: 13, color: 'var(--lp-text-tertiary)' }}>
          Your answers save automatically as you go — no submit button to worry
          about. Anything you don’t have yet can be left blank and added later.
        </p>
      </div>

      {alreadySubmitted ? (
        <div
          style={{
            ...cardStyle,
            borderColor: 'color-mix(in srgb, var(--color-lp-status-needs-review) 40%, transparent)',
            background: 'color-mix(in srgb, var(--color-lp-status-needs-review) 6%, var(--lp-surface))',
            padding: '12px 16px',
            fontSize: 13,
            color: 'var(--lp-text-secondary)',
          }}
        >
          You’ve already submitted this form. You can update your answers below
          and submit again.
        </div>
      ) : null}

      {/* P7 Checkpoint C — upload-your-tech-pack alternative to form-filling. */}
      <TechPackUpload token={token} />

      {/* Sections — accordion, single column, big touch inputs (Checkpoint D). */}
      {schema.sections.map((section) => (
        <details key={section.template_id} open style={cardStyle}>
          <summary
            className="flex cursor-pointer list-none items-center justify-between border-b px-5 py-3 [&::-webkit-details-marker]:hidden"
            style={{ borderColor: 'var(--lp-border-subtle)' }}
          >
            <h2
              style={{
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: 'var(--lp-text)',
              }}
            >
              {section.label}
            </h2>
            <span style={{ flexShrink: 0, fontSize: 12, color: 'var(--lp-text-tertiary)' }}>
              {answeredInSection(section.template_id)}/{section.fields.length}
            </span>
          </summary>
          <div className="flex flex-col gap-4 p-4">
            {section.fields.map((field) => (
              <FieldInput
                key={field.id}
                field={field}
                value={answers[section.template_id]?.[field.id]}
                onChange={(v) => setField(section.template_id, field.id, v)}
                provenance={proposals[section.template_id]?.[field.id]?.provenance}
              />
            ))}
          </div>
        </details>
      ))}

      {/* Submitter identity */}
      <div style={cardStyle}>
        <div className="flex flex-col gap-4 p-4">
          <Labeled label="Your name (optional)">
            <input
              type="text"
              value={submitterName}
              onChange={(e) => setSubmitterName(e.target.value)}
              style={inputStyle}
              autoComplete="name"
            />
          </Labeled>
          <Labeled label="Your email (optional)">
            <input
              type="email"
              value={submitterEmail}
              onChange={(e) => setSubmitterEmail(e.target.value)}
              style={inputStyle}
              autoComplete="email"
            />
          </Labeled>
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          style={{
            ...cardStyle,
            borderColor: 'color-mix(in srgb, var(--color-lp-error) 45%, transparent)',
            background: 'color-mix(in srgb, var(--color-lp-error) 7%, var(--lp-surface))',
            padding: '12px 16px',
            fontSize: 13,
            color: 'var(--color-lp-error)',
          }}
        >
          {error}
        </div>
      ) : null}

      {/* Submit */}
      <div className="flex items-center justify-between gap-4">
        <p style={{ fontSize: 12, color: 'var(--lp-text-tertiary)' }}>
          Powered by Lowpass
        </p>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="btn-transition inline-flex items-center gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-lp-orange)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--lp-bg-deep)] disabled:opacity-60"
          style={{
            padding: '11px 20px',
            background: 'var(--color-lp-orange)',
            color: '#ffffff',
            fontSize: 14,
            fontWeight: 600,
            cursor: submitting ? 'default' : 'pointer',
          }}
        >
          <Send size={15} />
          {submitting ? 'Finishing…' : 'I’m done — notify my TM'}
        </button>
      </div>
    </div>
  );
}

function Labeled({
  label,
  required,
  wide,
  children,
}: {
  label: string;
  required?: boolean;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <label
        style={{
          display: 'block',
          marginBottom: 6,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: 'var(--lp-text-secondary)',
        }}
      >
        {label}
        {required ? <span style={{ color: 'var(--color-lp-orange)' }}> *</span> : null}
      </label>
      {children}
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
  provenance,
}: {
  field: IntakeField;
  value: unknown;
  onChange: (v: unknown) => void;
  /** P7 Checkpoint B — prefill provenance ("From your Mar 2026 show …"). */
  provenance?: string;
}) {
  const wide =
    field.type === 'textarea' ||
    (typeof value === 'string' && value.length > 60);
  const str = value === null || value === undefined ? '' : String(value);

  let control: React.ReactNode;
  if (field.type === 'textarea') {
    control = (
      <textarea
        value={str}
        placeholder={field.placeholder}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
      />
    );
  } else if (field.type === 'dropdown' || field.type === 'select') {
    control = (
      <select
        value={str}
        onChange={(e) => onChange(e.target.value || null)}
        style={{ ...inputStyle, cursor: 'pointer' }}
      >
        <option value="">Select…</option>
        {(field.options ?? []).map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  } else if (field.type === 'boolean' || field.type === 'checkbox') {
    const checked = value === true || value === 'true';
    control = (
      <label
        className="inline-flex cursor-pointer items-center gap-2"
        style={{ fontSize: 14, color: 'var(--lp-text)' }}
      >
        <input
          type="checkbox"
          className="lp-checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        {checked ? 'Yes' : 'No'}
      </label>
    );
  } else if (field.type === 'labor_call') {
    // P7 — venue-fillable Labor call block. Rows land PENDING; the TM's review
    // accept applies them additively to labor_calls (P6).
    const rows = Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
    const setRow = (i: number, patch: Record<string, unknown>) =>
      onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    control = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <input placeholder="Dept" value={String(r.department ?? '')} onChange={(e) => setRow(i, { department: e.target.value })} style={{ ...inputStyle, flex: 1, minWidth: 90 }} />
            <input type="time" value={String(r.call_time ?? '')} onChange={(e) => setRow(i, { call_time: e.target.value || null })} style={{ ...inputStyle, width: 110 }} />
            <input type="number" min={0} placeholder="Heads" value={r.headcount == null ? '' : String(r.headcount)} onChange={(e) => setRow(i, { headcount: e.target.value === '' ? null : Number(e.target.value) })} style={{ ...inputStyle, width: 80 }} />
            <input placeholder="Company" value={String(r.company ?? '')} onChange={(e) => setRow(i, { company: e.target.value })} style={{ ...inputStyle, flex: 1, minWidth: 100 }} />
            <button type="button" aria-label="Remove call" onClick={() => onChange(rows.filter((_, j) => j !== i))} style={{ border: '1px solid var(--lp-border)', borderRadius: 6, background: 'var(--lp-surface)', color: 'var(--lp-text-tertiary)', padding: '4px 8px', cursor: 'pointer' }}>×</button>
          </div>
        ))}
        <button type="button" onClick={() => onChange([...rows, { department: '', call_time: null, headcount: null, company: '', contact_name: '', contact_phone: '' }])} style={{ alignSelf: 'flex-start', border: '1px solid var(--lp-border)', borderRadius: 6, background: 'var(--lp-surface)', color: 'var(--lp-text-secondary)', padding: '6px 10px', fontSize: 13, cursor: 'pointer' }}>+ Add crew call</button>
      </div>
    );
  } else {
    const inputType =
      field.type === 'number' || field.type === 'currency'
        ? 'number'
        : field.type === 'date'
          ? 'date'
          : field.type === 'time'
            ? 'time'
            : field.type === 'url'
              ? 'url'
              : 'text';
    control = (
      <input
        type={inputType}
        value={str}
        placeholder={field.placeholder}
        onChange={(e) => {
          const v = e.target.value;
          if (
            (field.type === 'number' || field.type === 'currency') &&
            v !== ''
          ) {
            const n = Number(v);
            onChange(Number.isFinite(n) ? n : v);
          } else {
            onChange(v);
          }
        }}
        step={field.type === 'currency' ? '0.01' : undefined}
        style={inputStyle}
      />
    );
  }

  return (
    <Labeled label={field.label} required={field.required} wide={wide}>
      {control}
      {provenance ? (
        <p style={{ marginTop: 4, fontSize: 11, color: 'var(--lp-orange)' }}>
          {provenance} — confirm or correct
        </p>
      ) : null}
      {field.helpText ? (
        <p style={{ marginTop: 4, fontSize: 11, color: 'var(--lp-text-tertiary)' }}>
          {field.helpText}
        </p>
      ) : null}
    </Labeled>
  );
}

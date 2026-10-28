'use client';

/* ============================================
   The show page's sections: one card per section, one row per question.

   A row is either an answer you can edit in place (saved as you go, one
   field at a time — advance_merge_answers merges, so nothing else on the
   day is overwritten), or a venue answer waiting for you (Accept / Edit /
   Reject; where it disagrees with yours: Keep mine / Use venue's). Each
   answer says where it came from; a pack answer opens the pack at the quote.
   ============================================ */

import { useEffect, useRef, useState } from 'react';
import { isEmptyAnswer } from '@/lib/advance/intake';
import { countedFields, sectionProgress, type AdvField, type AdvSection, type AdvData } from '@/lib/advance/board';
import type { FieldSource, PendingAnswer } from '@/server/advance/show';
import { fmtWhen } from './format';

export interface SectionsProps {
  sections: AdvSection[];
  data: AdvData;
  sources: Record<string, FieldSource>;
  pending: PendingAnswer[];
  requestLive: boolean;
  onSave: (sectionId: string, fieldId: string, value: unknown) => Promise<void>;
  onReview: (accept: PendingAnswer[], reject: PendingAnswer[], replaceWith?: { p: PendingAnswer; value: unknown }) => Promise<void>;
  onOpenSource: (src: FieldSource, label: string) => void;
  /** Rendered after the Schedule section (local crew calls). */
  afterSchedule?: React.ReactNode;
}

function display(v: unknown): string {
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (v === null || v === undefined) return '';
  return typeof v === 'string' ? v : String(v);
}

function same(a: unknown, b: unknown): boolean {
  return display(a).trim().toLowerCase() === display(b).trim().toLowerCase();
}

function SourceChip({ src, onOpen, label }: { src: FieldSource | undefined; onOpen: (s: FieldSource, l: string) => void; label: string }) {
  if (!src) return null;
  if (src.kind === 'pack') {
    return (
      <button type="button" onClick={() => onOpen(src, label)} title={src.quote ? `“${src.quote}”` : undefined}>
        {(src.file_name ?? 'Info pack').replace(/\.[a-z0-9]+$/i, '')}
        {src.page ? ` p.${src.page}` : ''}
      </button>
    );
  }
  if (src.kind === 'venue') return <span>Venue{src.at ? ` · ${fmtWhen(src.at)}` : ''}</span>;
  if (src.kind === 'previous') return <span>Earlier show here</span>;
  return <span>You{src.at ? ` · ${fmtWhen(src.at)}` : ''}</span>;
}

function Editor({ field, value, onCommit, id }: { field: AdvField; value: unknown; onCommit: (v: unknown) => void; id: string }) {
  const [v, setV] = useState<string>(display(value));
  const last = useRef(display(value));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const d = display(value);
    if (d !== last.current) {
      last.current = d;
      setV(d);
    }
  }, [value]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const commit = (next: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (next === last.current) return;
    last.current = next;
    if (field.type === 'number' || field.type === 'currency') {
      const n = next.trim() === '' ? null : Number(next);
      onCommit(n === null || Number.isFinite(n) ? n : next);
    } else onCommit(next.trim() === '' ? null : next);
  };
  const change = (next: string) => {
    setV(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => commit(next), 800);
  };

  if (field.type === 'boolean' || field.type === 'checkbox') {
    const cur = value === true ? 'yes' : value === false ? 'no' : '';
    return (
      <span className="adv-yn" role="group" aria-labelledby={`${id}-l`}>
        {(['yes', 'no'] as const).map((k) => (
          <button key={k} type="button" aria-pressed={cur === k} onClick={() => onCommit(cur === k ? null : k === 'yes')}>
            {k === 'yes' ? 'Yes' : 'No'}
          </button>
        ))}
      </span>
    );
  }
  if (field.type === 'select' && field.options?.length) {
    return (
      <select id={id} className="adv-input" value={v} onChange={(e) => { setV(e.target.value); commit(e.target.value); }}>
        <option value="">—</option>
        {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (field.type === 'textarea') {
    return (
      <textarea
        id={id}
        className="adv-input"
        rows={Math.min(8, Math.max(1, v.split('\n').length))}
        value={v}
        placeholder="Not answered"
        onChange={(e) => change(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
      />
    );
  }
  const type = field.type === 'time' ? 'time' : field.type === 'date' ? 'date' : field.type === 'number' || field.type === 'currency' ? 'number' : field.type === 'url' ? 'url' : 'text';
  return (
    <input
      id={id}
      className="adv-input"
      type={type}
      value={v}
      placeholder={field.placeholder || 'Not answered'}
      onChange={(e) => change(e.target.value)}
      onBlur={(e) => commit(e.target.value)}
      style={type === 'time' || type === 'date' ? { maxWidth: 180, fontFamily: 'var(--lp-font-numeric)' } : undefined}
    />
  );
}

function Question({
  section,
  field,
  props,
}: {
  section: AdvSection;
  field: AdvField;
  props: SectionsProps;
}) {
  const key = `${section.template_id}:${field.id}`;
  const value = props.data[section.template_id]?.[field.id];
  const p = props.pending.find((x) => x.section_id === section.template_id && x.field_id === field.id);
  const [flash, setFlash] = useState(false);
  const [gone, setGone] = useState(false);
  const [busy, setBusy] = useState(false);
  const id = `q-${section.template_id}-${field.id}`.replace(/[^A-Za-z0-9_-]/g, '_');

  const save = async (v: unknown) => {
    await props.onSave(section.template_id, field.id, v);
    setFlash(true);
    setTimeout(() => setFlash(false), 900);
  };
  const review = async (fn: () => Promise<void>) => {
    setBusy(true);
    setGone(true);
    try {
      await fn();
    } catch {
      setGone(false);
    } finally {
      setBusy(false);
    }
  };

  if (p && !gone) {
    const differs = !isEmptyAnswer(value) && !same(value, p.value);
    return (
      <div className="adv-q" data-pending="true">
        <span className="adv-q-label" id={`${id}-l`}>{field.label}</span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 6 }}>
          {differs ? (
            <span style={{ fontSize: 'var(--lp-text-base)' }}>
              <span className="adv-says adv-muted">You have</span>
              {display(value)}
            </span>
          ) : null}
          <span style={{ fontSize: 'var(--lp-text-base)' }}>
            <span className="adv-says adv-says-venue">Venue says</span>
            {display(p.value)}
          </span>
          <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {differs ? (
              <>
                <button type="button" className="adv-btn adv-btn-sm adv-btn-light" disabled={busy} onClick={() => review(() => props.onReview([], [p]))}>Keep mine</button>
                <button type="button" className="adv-btn adv-btn-sm" disabled={busy} onClick={() => review(() => props.onReview([p], []))}>Use venue’s</button>
              </>
            ) : (
              <>
                <button type="button" className="adv-btn adv-btn-sm adv-btn-light" disabled={busy} onClick={() => review(() => props.onReview([p], []))}>Accept</button>
                <button type="button" className="adv-btn adv-btn-sm adv-btn-ghost" disabled={busy} onClick={() => review(() => props.onReview([], [p]))}>Reject</button>
              </>
            )}
          </span>
        </span>
        <span className="adv-src">{differs ? 'Differs from yours' : 'New answer'}</span>
      </div>
    );
  }

  return (
    <div className="adv-q" data-flash={flash}>
      <label className="adv-q-label" id={`${id}-l`} htmlFor={id}>
        {field.label}
        {field.day_only ? <span className="adv-pill adv-pill-add" style={{ marginLeft: 6 }}>This day</span> : null}
      </label>
      <span>
        <Editor field={field} value={value} onCommit={(v) => void save(v)} id={id} />
        {field.helpText ? <span className="adv-muted" style={{ display: 'block', fontSize: 'var(--lp-text-xs)', padding: '2px 10px' }}>{field.helpText}</span> : null}
      </span>
      <span className="adv-src">
        {flash ? <span className="adv-saved">Saved</span> : <SourceChip src={props.sources[key]} onOpen={props.onOpenSource} label={field.label} />}
      </span>
    </div>
  );
}

export function ShowSections(props: SectionsProps) {
  const pendBySection: Record<string, number> = {};
  for (const p of props.pending) pendBySection[p.section_id] = (pendBySection[p.section_id] ?? 0) + 1;

  const schedIdx = Math.max(0, props.sections.findIndex((s) => s.label.trim().toLowerCase() === 'schedule'));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
      {props.sections.map((s, i) => {
        const prog = sectionProgress(s, props.data, pendBySection, props.requestLive);
        const fields = countedFields(s);
        const head = (
          <div className="adv-section-head">
            <h2>{s.label}</h2>
            {s.tm_only ? <span className="adv-pill adv-pill-tm">Only you</span> : null}
            {prog.state === 'review' ? (
              <span style={{ fontSize: 'var(--lp-text-xs)', color: 'color-mix(in srgb, var(--color-lp-warning) 75%, var(--lp-text))' }}>{prog.toReview} to review</span>
            ) : prog.state === 'done' ? (
              <span style={{ fontSize: 'var(--lp-text-xs)', color: 'color-mix(in srgb, var(--color-lp-success) 60%, var(--lp-text))' }}>✓ All answered</span>
            ) : prog.state === 'asked' ? (
              <span style={{ fontSize: 'var(--lp-text-xs)', color: 'color-mix(in srgb, var(--color-lp-info) 60%, var(--lp-text))' }}>Asked the venue</span>
            ) : null}
            <span className="adv-grow" />
            <span className="adv-muted" style={{ fontSize: 'var(--lp-text-xs)' }}>{prog.answered} of {prog.total} answered</span>
          </div>
        );
        return (
          <div key={s.template_id} style={{ display: 'contents' }}>
            <section id={`sec-${s.template_id}`} aria-label={s.label} className="adv-section" style={{ ['--i' as string]: i }}>
              {head}
              {fields.length === 0 ? (
                <div className="adv-q"><span className="adv-muted" style={{ gridColumn: '1 / -1', fontSize: 'var(--lp-text-sm)', paddingTop: 4 }}>No questions in this section yet — add some with Customise this day.</span></div>
              ) : (
                fields.map((f) => <Question key={f.id} section={s} field={f} props={props} />)
              )}
            </section>
            {i === schedIdx && props.afterSchedule ? props.afterSchedule : null}
          </div>
        );
      })}
    </div>
  );
}

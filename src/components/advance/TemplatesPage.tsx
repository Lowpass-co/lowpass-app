'use client';

/* ============================================
   <TemplatesPage> — advance templates, workspace-wide (Oct 2026 rebuild).

   Which template each day type gets (new days start from it), and the
   templates themselves: sections, questions, order. Saving a template
   reaches the days that follow it — not days you customised by hand, and not
   days already sent to a venue (the venue keeps what it was asked).
   ============================================ */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { isContactSection, isLinkedSection, newFieldId, type AdvField, type AdvSection } from '@/lib/advance/board';
import { advanceCall } from './api';
import './advance.css';

interface Tpl { id: string; name: string; sections: AdvSection[]; days: number }

const DAY_TYPES: [string, string, string][] = [
  ['show', 'Show', 'var(--color-lp-success)'],
  ['festival', 'Festival', 'var(--color-lp-success)'],
  ['rehearsal', 'Rehearsal', 'var(--lp-text-tertiary)'],
  ['press', 'Press', 'var(--lp-text-tertiary)'],
  ['travel', 'Travel', 'var(--color-lp-info)'],
  ['off', 'Day off', 'var(--lp-text-tertiary)'],
];
const QUESTION_TYPES: [string, string][] = [
  ['text', 'Short answer'],
  ['textarea', 'Long answer'],
  ['time', 'Time'],
  ['boolean', 'Yes / no'],
  ['number', 'Number'],
];

export function TemplatesPage({ tourId, initial }: { tourId: string; initial: { templates: Tpl[]; mapping: Record<string, string> } }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [templates, setTemplates] = useState<Tpl[]>(initial.templates);
  const [mapping, setMapping] = useState(initial.mapping);
  const [selId, setSelId] = useState<string | null>(initial.mapping.show ?? initial.templates[0]?.id ?? null);
  const sel = templates.find((t) => t.id === selId) ?? null;
  const [draft, setDraft] = useState<AdvSection[]>(sel?.sections ?? []);
  const [name, setName] = useState(sel?.name ?? '');
  const [open, setOpen] = useState<string | null>(null);
  const [library, setLibrary] = useState<AdvSection[]>([]);
  const [newQ, setNewQ] = useState({ label: '', type: 'text' });
  const [newSection, setNewSection] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setDraft(sel?.sections ?? []);
    setName(sel?.name ?? '');
    setOpen(null);
    setConfirmDelete(false);
  }, [sel]);

  useEffect(() => {
    fetch('/api/advance/templates')
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((j: { templates?: { id: string; name: string; fields: AdvField[]; tm_only?: boolean }[] }) =>
        setLibrary((j.templates ?? []).map((t) => ({ template_id: t.id, label: t.name, fields: t.fields ?? [], tm_only: t.tm_only === true }))),
      )
      .catch(() => {});
  }, []);

  const dirty = useMemo(() => !!sel && (name !== sel.name || JSON.stringify(draft) !== JSON.stringify(sel.sections)), [sel, name, draft]);

  const setMap = async (dayType: string, templateId: string) => {
    const next = { ...mapping };
    if (templateId) next[dayType] = templateId;
    else delete next[dayType];
    setMapping(next);
    try {
      const out = await advanceCall<{ mapping: Record<string, string> }>('/api/advance/template-set', {
        method: 'PUT',
        body: JSON.stringify({ mapping: { [dayType]: templateId || null } }),
      });
      setMapping(out.mapping);
      router.refresh();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Couldn’t save', 'error');
    }
  };

  const save = async () => {
    if (!sel) return;
    setBusy(true);
    try {
      const out = await advanceCall<{ template: Tpl; days: { updated: number; kept: number } }>(`/api/advance/template-set/${sel.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name, sections: draft.map((s, i) => ({ ...s, order: i })) }),
      });
      setTemplates((ts) => ts.map((t) => (t.id === sel.id ? { ...t, ...out.template, days: t.days } : t)));
      showToast(out.days.updated || out.days.kept ? `Saved · ${out.days.updated} ${out.days.updated === 1 ? 'day' : 'days'} updated${out.days.kept ? `, ${out.days.kept} kept their own` : ''}` : 'Saved');
      router.refresh();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Couldn’t save', 'error');
    } finally {
      setBusy(false);
    }
  };

  const create = async (copyOf?: string) => {
    const n = newName.trim();
    if (!n) return;
    setBusy(true);
    try {
      const out = await advanceCall<{ template: Tpl }>('/api/advance/template-set', {
        method: 'POST',
        body: JSON.stringify({ name: n, ...(copyOf ? { copyOf } : { sections: starterSections(library) }) }),
      });
      setTemplates((ts) => [...ts, out.template].sort((a, b) => a.name.localeCompare(b.name)));
      setSelId(out.template.id);
      setCreating(false);
      setNewName('');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Couldn’t make it', 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!sel) return;
    setBusy(true);
    try {
      await advanceCall(`/api/advance/template-set/${sel.id}`, { method: 'DELETE' });
      setTemplates((ts) => ts.filter((t) => t.id !== sel.id));
      setMapping((m) => Object.fromEntries(Object.entries(m).filter(([, v]) => v !== sel.id)));
      setSelId(null);
      router.refresh();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Couldn’t delete it', 'error');
    } finally {
      setBusy(false);
    }
  };

  const move = (from: number, to: number) =>
    setDraft((d) => {
      if (to < 0 || to >= d.length) return d;
      const n = [...d];
      const [x] = n.splice(from, 1);
      n.splice(to, 0, x);
      return n;
    });

  const visible = draft.filter((s) => !isLinkedSection(s) && !isContactSection(s));

  return (
    <div className="adv-page">
      <div>
        <Link href={`/advance/${tourId}`} style={{ fontSize: 'var(--lp-text-xs)' }}>
          <ArrowLeft size={13} aria-hidden /> Advance
        </Link>
        <h1 className="lp-page-title" style={{ margin: '6px 0 0' }}>Templates</h1>
        <p className="adv-sub">Shared across all your tours. Every new day gets the template for its day type; you can still change any single day.</p>
      </div>

      <div className="adv-cols" style={{ alignItems: 'flex-start' }}>
        <div style={{ width: 380, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="adv-card" style={{ padding: 0, gap: 0 }}>
            <h2 style={{ margin: 0, padding: '14px 16px 10px', fontSize: 'var(--lp-text-sm)', fontWeight: 600 }}>Which template each day type gets</h2>
            {DAY_TYPES.map(([id, label, color]) => (
              <label key={id} style={{ display: 'grid', gridTemplateColumns: '110px minmax(0, 1fr)', gap: 12, alignItems: 'center', padding: '8px 16px', borderTop: '1px solid var(--lp-border-light)', fontSize: 'var(--lp-text-sm)' }}>
                <span className="adv-row-flex" style={{ gap: 8 }}><span className="adv-dot" style={{ background: color }} aria-hidden />{label}</span>
                <select className="adv-field" style={{ height: 34 }} value={mapping[id] ?? ''} onChange={(e) => void setMap(id, e.target.value)}>
                  <option value="">{id === 'show' || id === 'festival' ? 'A template called “Show day”, if any' : 'No advance'}</option>
                  {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
            ))}
          </div>

          <div className="adv-card" style={{ padding: 8, gap: 2 }}>
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelId(t.id)}
                className="adv-tab"
                aria-current={t.id === selId}
                style={{ width: '100%', height: 40, justifyContent: 'space-between' }}
              >
                <span>{t.name}</span>
                <span className="adv-muted" style={{ fontSize: 'var(--lp-text-xs)' }}>{t.sections.length} sections · {t.days} days</span>
              </button>
            ))}
            {creating ? (
              <form style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8 }} onSubmit={(e) => { e.preventDefault(); void create(); }}>
                <input className="adv-field" autoFocus placeholder="Template name — e.g. Festival" value={newName} onChange={(e) => setNewName(e.target.value)} aria-label="Template name" />
                <span className="adv-row-flex" style={{ gap: 6 }}>
                  <button type="submit" className="adv-btn adv-btn-sm adv-btn-light" disabled={busy}>Make it</button>
                  {sel ? <button type="button" className="adv-btn adv-btn-sm" disabled={busy} onClick={() => void create(sel.id)}>Copy of {sel.name}</button> : null}
                  <button type="button" className="adv-btn adv-btn-sm adv-btn-ghost" onClick={() => setCreating(false)}>Cancel</button>
                </span>
              </form>
            ) : (
              <button type="button" className="adv-link" style={{ padding: '10px 12px', textAlign: 'left' }} onClick={() => setCreating(true)}>
                <Plus size={13} aria-hidden /> New template
              </button>
            )}
          </div>
        </div>

        <div className="adv-card adv-grow" style={{ padding: 0, gap: 0 }}>
          {!sel ? (
            <div className="adv-muted" style={{ padding: 24, fontSize: 'var(--lp-text-sm)' }}>
              {templates.length ? 'Pick a template to edit it.' : 'No templates yet — make a “Show day” template to start.'}
            </div>
          ) : (
            <>
              <div className="adv-row-flex" style={{ padding: '14px 16px' }}>
                <input className="adv-input adv-grow" aria-label="Template name" value={name} onChange={(e) => setName(e.target.value)} style={{ fontSize: 'var(--lp-text-lg)', fontWeight: 600, maxWidth: 360 }} />
                <span className="adv-muted" style={{ fontSize: 'var(--lp-text-xs)' }}>Used by {sel.days} {sel.days === 1 ? 'day' : 'days'}</span>
                {confirmDelete ? (
                  <span className="adv-row-flex" style={{ gap: 6 }}>
                    <span style={{ fontSize: 'var(--lp-text-xs)' }}>Delete? Days keep their questions.</span>
                    <button type="button" className="adv-btn adv-btn-sm" style={{ background: 'var(--color-lp-error)', borderColor: 'var(--color-lp-error)', color: 'var(--lp-text-inverse)' }} onClick={() => void remove()}>Delete</button>
                    <button type="button" className="adv-btn adv-btn-sm adv-btn-ghost" onClick={() => setConfirmDelete(false)}>Keep</button>
                  </span>
                ) : (
                  <button type="button" className="adv-btn adv-btn-sm adv-btn-ghost" aria-label="Delete template" onClick={() => setConfirmDelete(true)}><Trash2 size={14} aria-hidden /></button>
                )}
              </div>
              {visible.map((s) => {
                const i = draft.indexOf(s);
                return (
                  <div key={s.template_id}>
                    <div className="adv-sec-row">
                      <span className="adv-grow" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ fontWeight: 600 }}>{s.label}</span>
                        <span className="adv-muted" style={{ fontSize: 'var(--lp-text-xs)' }}>{s.fields.length} questions</span>
                      </span>
                      <span className={`adv-pill ${s.tm_only ? 'adv-pill-tm' : 'adv-pill-add'}`}>{s.tm_only ? 'Only you' : 'Venue answers'}</span>
                      <button type="button" className="adv-btn adv-btn-sm adv-btn-ghost" aria-label={`Move ${s.label} up`} onClick={() => move(i, i - 1)}><ChevronUp size={14} aria-hidden /></button>
                      <button type="button" className="adv-btn adv-btn-sm adv-btn-ghost" aria-label={`Move ${s.label} down`} onClick={() => move(i, i + 1)}><ChevronDown size={14} aria-hidden /></button>
                      <button type="button" className="adv-btn adv-btn-sm" aria-expanded={open === s.template_id} onClick={() => setOpen(open === s.template_id ? null : s.template_id)}>Questions</button>
                      <button type="button" className="adv-btn adv-btn-sm adv-btn-ghost" aria-label={`Remove ${s.label}`} onClick={() => setDraft((d) => d.filter((x) => x.template_id !== s.template_id))}><Trash2 size={14} aria-hidden /></button>
                    </div>
                    {open === s.template_id ? (
                      <div style={{ padding: '4px 0 12px', background: 'var(--lp-bg-deep)' }}>
                        {s.fields.map((f) => (
                          <div key={f.id} className="adv-qrow">
                            <span className="adv-grow">{f.label}</span>
                            <span className="adv-muted" style={{ fontSize: 'var(--lp-text-xs)' }}>{QUESTION_TYPES.find(([v]) => v === f.type)?.[1] ?? f.type}</span>
                            <button type="button" className="adv-btn adv-btn-sm adv-btn-ghost" aria-label={`Remove ${f.label}`} onClick={() => setDraft((d) => d.map((x) => (x.template_id === s.template_id ? { ...x, fields: x.fields.filter((y) => y.id !== f.id) } : x)))}>
                              <Trash2 size={13} aria-hidden />
                            </button>
                          </div>
                        ))}
                        <form
                          className="adv-row-flex"
                          style={{ padding: '6px 14px 0 64px', gap: 6 }}
                          onSubmit={(e) => {
                            e.preventDefault();
                            if (!newQ.label.trim()) return;
                            const id = newFieldId(newQ.label, s.fields.map((f) => f.id)).replace(/^day_/, 'q_');
                            setDraft((d) => d.map((x) => (x.template_id === s.template_id ? { ...x, fields: [...x.fields, { id, label: newQ.label.trim(), type: newQ.type }] } : x)));
                            setNewQ({ label: '', type: newQ.type });
                          }}
                        >
                          <input className="adv-field" style={{ flex: 1, minWidth: 160, height: 32 }} placeholder="Add a question" aria-label={`New question in ${s.label}`} value={newQ.label} onChange={(e) => setNewQ({ ...newQ, label: e.target.value })} />
                          <select className="adv-field" style={{ width: 130, height: 32 }} aria-label="Answer type" value={newQ.type} onChange={(e) => setNewQ({ ...newQ, type: e.target.value })}>
                            {QUESTION_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                          <button type="submit" className="adv-btn adv-btn-sm"><Plus size={13} aria-hidden /> Add</button>
                        </form>
                      </div>
                    ) : null}
                  </div>
                );
              })}
              <div style={{ padding: '14px 16px', borderTop: '1px solid var(--lp-border-light)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span className="adv-muted" style={{ fontSize: 'var(--lp-text-xs)' }}>Add from the library</span>
                <div className="adv-row-flex" style={{ gap: 8 }}>
                  {library
                    .filter((l) => !draft.some((d) => d.template_id === l.template_id) && !isLinkedSection(l) && !isContactSection(l))
                    .map((l) => (
                      <button key={l.template_id} type="button" className="adv-chip" style={{ borderStyle: 'dashed' }} onClick={() => setDraft((d) => [...d, { ...l, order: d.length }])}>
                        + {l.label}
                      </button>
                    ))}
                </div>
                <form
                  className="adv-row-flex"
                  style={{ gap: 6 }}
                  onSubmit={(e) => {
                    e.preventDefault();
                    const label = newSection.trim();
                    if (!label) return;
                    const id = `own_${label.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 30)}_${draft.length}`;
                    setDraft((d) => [...d, { template_id: id, label, fields: [], order: d.length }]);
                    setOpen(id);
                    setNewSection('');
                  }}
                >
                  <input className="adv-field" style={{ flex: 1, maxWidth: 360 }} placeholder="Your own section — e.g. Ferry" aria-label="Your own section" value={newSection} onChange={(e) => setNewSection(e.target.value)} />
                  <button type="submit" className="adv-btn adv-btn-sm">Add section</button>
                </form>
              </div>
              <div className="adv-row-flex" style={{ padding: '14px 16px', borderTop: '1px solid var(--lp-border)' }}>
                <span className="adv-grow adv-muted" style={{ fontSize: 'var(--lp-text-xs)', lineHeight: 1.5 }}>
                  Saving reaches the days that use this template — except days you customised and days already sent to a venue.
                </span>
                <button type="button" className="adv-btn adv-btn-ghost" disabled={!dirty || busy} onClick={() => { setDraft(sel.sections); setName(sel.name); }}>Undo changes</button>
                <button type="button" className="adv-btn adv-btn-primary" disabled={!dirty || busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save template'}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** A new blank template starts with the usual show-day sections from the library. */
function starterSections(library: AdvSection[]): AdvSection[] {
  const want = ['Schedule', 'Production', 'Hospitality', 'Dressing Rooms', 'Security', 'Comps and Ticketing', 'Merch', 'Settlement'];
  return want
    .map((w) => library.find((l) => l.label.toLowerCase() === w.toLowerCase()))
    .filter((x): x is AdvSection => !!x)
    .map((s, i) => ({ ...s, order: i }));
}

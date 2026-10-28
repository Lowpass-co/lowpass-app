'use client';

/* ============================================
   <CustomiseDrawer> — change one day's questions without touching the
   template (Oct 2026 rebuild). Switch sections off, drop or add questions,
   add a section, reorder. Switching something off never deletes answers: they
   stay stored and come back when it's switched on again.
   "Also save to <template>" writes the same layout to the template, which then
   reaches every following day that isn't customised or already sent.
   ============================================ */

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, GripVertical, Plus, X } from 'lucide-react';
import { SlideOver } from '@/components/ui/SlideOver';
import { useToast } from '@/components/ui/Toast';
import {
  changeCount,
  dayChanges,
  isContactSection,
  isLinkedSection,
  newFieldId,
  type AdvField,
  type AdvSection,
} from '@/lib/advance/board';
import { resetSections, saveSections } from './api';
import './advance.css';

type Row = { section: AdvSection; on: boolean; open: boolean };

const QUESTION_TYPES: [string, string][] = [
  ['text', 'Short answer'],
  ['textarea', 'Long answer'],
  ['time', 'Time'],
  ['boolean', 'Yes / no'],
  ['number', 'Number'],
];

export function CustomiseDrawer({
  tourId,
  routingId,
  dayLabel,
  sections,
  template,
  templateSections,
  templates,
  onClose,
  onSaved,
}: {
  tourId: string;
  routingId: string;
  dayLabel: string;
  sections: AdvSection[];
  template: { id: string; name: string } | null;
  templateSections: AdvSection[] | null;
  templates: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { showToast } = useToast();
  const kept = useMemo(() => sections.filter((s) => isLinkedSection(s) || isContactSection(s)), [sections]);
  const initial = useMemo<Row[]>(() => {
    const day = sections.filter((s) => !isLinkedSection(s) && !isContactSection(s));
    const ids = new Set(day.map((s) => s.template_id));
    const offFromTemplate = (templateSections ?? [])
      .filter((s) => !ids.has(s.template_id) && !isLinkedSection(s) && !isContactSection(s))
      .map((s) => ({ section: s, on: false, open: false }));
    return [...day.map((s) => ({ section: s, on: true, open: false })), ...offFromTemplate];
  }, [sections, templateSections]);

  const [rows, setRows] = useState<Row[]>(initial);
  const [dragging, setDragging] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmTemplate, setConfirmTemplate] = useState(false);
  const [library, setLibrary] = useState<AdvSection[] | null>(null);
  const [addingSection, setAddingSection] = useState(false);
  const [newSection, setNewSection] = useState('');
  const [newQ, setNewQ] = useState<Record<string, { label: string; type: string }>>({});

  useEffect(() => setRows(initial), [initial]);

  const daySections = (): AdvSection[] => [
    ...rows.filter((r) => r.on).map((r, i) => ({ ...r.section, order: i })),
    ...kept.map((s, i) => ({ ...s, order: rows.length + i })),
  ];
  const changes = changeCount(dayChanges(daySections(), templateSections));
  const dirty = JSON.stringify(daySections().map((s) => [s.template_id, s.fields.map((f) => f.id)])) !== JSON.stringify(sections.map((s) => [s.template_id, s.fields.map((f) => f.id)]));

  const loadLibrary = async () => {
    setAddingSection(true);
    if (library) return;
    try {
      const r = await fetch('/api/advance/templates');
      const j = (await r.json()) as { templates?: { id: string; name: string; fields: AdvField[] }[] };
      setLibrary((j.templates ?? []).map((t) => ({ template_id: t.id, label: t.name, fields: t.fields ?? [] })));
    } catch {
      setLibrary([]);
    }
  };

  const save = async (alsoTemplate: boolean) => {
    setSaving(true);
    try {
      const out = await saveSections(tourId, routingId, daySections(), alsoTemplate);
      if (alsoTemplate && out.templateDays) {
        showToast(`Saved to ${template?.name ?? 'the template'} · ${out.templateDays.updated} other ${out.templateDays.updated === 1 ? 'day' : 'days'} updated`);
      } else showToast('This day is customised');
      onSaved();
      onClose();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Couldn’t save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const reset = async (templateId?: string) => {
    setSaving(true);
    try {
      const out = await resetSections(tourId, routingId, templateId);
      showToast(templateId ? `Now using ${out.template.name}` : 'Back to the template');
      onSaved();
      onClose();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Couldn’t change it', 'error');
    } finally {
      setSaving(false);
    }
  };

  const update = (i: number, fn: (r: Row) => Row) => setRows((rs) => rs.map((r, j) => (j === i ? fn(r) : r)));
  const move = (from: number, to: number) =>
    setRows((rs) => {
      if (to < 0 || to >= rs.length || from === to) return rs;
      const next = [...rs];
      const [x] = next.splice(from, 1);
      next.splice(to, 0, x);
      return next;
    });

  const tplFieldIds = (sid: string) => new Set((templateSections ?? []).find((s) => s.template_id === sid)?.fields.map((f) => f.id) ?? []);
  const allTemplateFields = (sid: string) => (templateSections ?? []).find((s) => s.template_id === sid)?.fields ?? [];

  const footer = (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%', flexWrap: 'wrap' }}>
      {template ? (
        <button type="button" className="adv-btn adv-btn-ghost" disabled={saving} onClick={() => void reset()}>
          Reset to template
        </button>
      ) : null}
      <span className="adv-grow" />
      {template && confirmTemplate ? (
        <span className="adv-row-flex" style={{ gap: 8 }}>
          <span style={{ fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-secondary)' }}>Changes {template.name} for days not yet sent?</span>
          <button type="button" className="adv-btn adv-btn-sm" disabled={saving} onClick={() => void save(true)}>Yes, save</button>
          <button type="button" className="adv-btn adv-btn-sm adv-btn-ghost" onClick={() => setConfirmTemplate(false)}>No</button>
        </span>
      ) : template ? (
        <button type="button" className="adv-btn" disabled={saving || !dirty} onClick={() => setConfirmTemplate(true)}>
          Also save to {template.name}…
        </button>
      ) : null}
      <button type="button" className="adv-btn adv-btn-primary" disabled={saving} onClick={() => (dirty ? void save(false) : onClose())}>
        Done
      </button>
    </div>
  );

  return (
    <SlideOver open onClose={onClose} title="Customise this day" subtitle={dayLabel} width="wide" footer={footer}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="adv-row-flex" style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)', gap: 8 }}>
          <span className="adv-dot" style={{ width: 6, height: 6, background: 'var(--color-lp-info)' }} aria-hidden />
          Changes here affect only this day.
          {template ? <b style={{ color: 'var(--lp-text)', fontWeight: 600 }}>{changes === 0 ? 'Same as the template.' : `${changes} ${changes === 1 ? 'change' : 'changes'} from ${template.name}.`}</b> : null}
        </div>

        {templates.length ? (
          <label className="adv-label">
            Template for this day
            <select className="adv-field" value={template?.id ?? ''} disabled={saving} onChange={(e) => e.target.value && e.target.value !== template?.id && void reset(e.target.value)}>
              {!template ? <option value="">Choose a template…</option> : null}
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>
        ) : null}

        <div style={{ border: '1px solid var(--lp-border)', borderRadius: 10, overflow: 'hidden' }}>
          {rows.length === 0 ? <div className="adv-muted" style={{ padding: 16, fontSize: 'var(--lp-text-sm)' }}>No sections yet — add one below.</div> : null}
          {rows.map((r, i) => {
            const tplIds = tplFieldIds(r.section.template_id);
            const inTemplate = (templateSections ?? []).some((s) => s.template_id === r.section.template_id);
            const added = r.section.fields.filter((f) => !tplIds.has(f.id)).length;
            const hidden = allTemplateFields(r.section.template_id).filter((f) => !r.section.fields.some((x) => x.id === f.id));
            return (
              <div key={r.section.template_id}>
                <div
                  className="adv-sec-row"
                  data-off={!r.on}
                  data-drag={dragging === i}
                  draggable
                  onDragStart={() => setDragging(i)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragging !== null && dragging !== i) {
                      move(dragging, i);
                      setDragging(i);
                    }
                  }}
                  onDragEnd={() => setDragging(null)}
                  style={{ borderTop: i === 0 ? 0 : undefined }}
                >
                  <span className="adv-handle" aria-hidden><GripVertical size={14} /></span>
                  <button
                    type="button"
                    role="switch"
                    className="adv-switch"
                    aria-checked={r.on}
                    aria-label={`Include ${r.section.label} on this day`}
                    onClick={() => update(i, (x) => ({ ...x, on: !x.on, open: x.on ? false : x.open }))}
                  >
                    <span />
                  </button>
                  <span className="adv-grow" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 'var(--lp-text-base)', fontWeight: 600 }}>{r.section.label}</span>
                    <span className="adv-muted" style={{ fontSize: 'var(--lp-text-xs)' }}>
                      {r.section.fields.length} {r.section.fields.length === 1 ? 'question' : 'questions'}
                    </span>
                  </span>
                  {r.section.tm_only ? <span className="adv-pill adv-pill-tm">Only you</span> : null}
                  {!r.on ? <span className="adv-pill adv-pill-off">Hidden for this day</span> : !inTemplate && templateSections ? <span className="adv-pill adv-pill-add">Added for this day</span> : added ? <span className="adv-pill adv-pill-add">{added} added</span> : null}
                  <span className="adv-row-flex" style={{ gap: 2 }}>
                    <button type="button" className="adv-btn adv-btn-sm adv-btn-ghost" aria-label={`Move ${r.section.label} up`} onClick={() => move(i, i - 1)} disabled={i === 0}><ChevronUp size={14} aria-hidden /></button>
                    <button type="button" className="adv-btn adv-btn-sm adv-btn-ghost" aria-label={`Move ${r.section.label} down`} onClick={() => move(i, i + 1)} disabled={i === rows.length - 1}><ChevronDown size={14} aria-hidden /></button>
                  </span>
                  <button type="button" className="adv-btn adv-btn-sm" aria-expanded={r.open} disabled={!r.on} onClick={() => update(i, (x) => ({ ...x, open: !x.open }))}>
                    Questions
                  </button>
                </div>
                {r.open && r.on ? (
                  <div style={{ padding: '4px 0 12px', background: 'var(--lp-bg-deep)' }}>
                    {r.section.fields.map((f) => (
                      <label key={f.id} className="adv-qrow">
                        <input
                          type="checkbox"
                          checked
                          onChange={() => update(i, (x) => ({ ...x, section: { ...x.section, fields: x.section.fields.filter((y) => y.id !== f.id) } }))}
                        />
                        <span className="adv-grow">{f.label}</span>
                        {!tplIds.has(f.id) ? <span className="adv-pill adv-pill-add">Added for this day</span> : null}
                      </label>
                    ))}
                    {hidden.map((f) => (
                      <label key={f.id} className="adv-qrow" style={{ opacity: 0.6 }}>
                        <input type="checkbox" checked={false} onChange={() => update(i, (x) => ({ ...x, section: { ...x.section, fields: [...x.section.fields, f] } }))} />
                        <span className="adv-grow">{f.label}</span>
                        <span className="adv-pill adv-pill-off">Hidden for this day</span>
                      </label>
                    ))}
                    <form
                      className="adv-row-flex"
                      style={{ padding: '6px 14px 0 64px', gap: 6 }}
                      onSubmit={(e) => {
                        e.preventDefault();
                        const q = newQ[r.section.template_id];
                        if (!q?.label.trim()) return;
                        const id = newFieldId(q.label, r.section.fields.map((f) => f.id));
                        update(i, (x) => ({ ...x, section: { ...x.section, fields: [...x.section.fields, { id, label: q.label.trim(), type: q.type, day_only: true }] } }));
                        setNewQ({ ...newQ, [r.section.template_id]: { label: '', type: q.type } });
                      }}
                    >
                      <input
                        className="adv-field"
                        style={{ flex: 1, minWidth: 160, height: 32 }}
                        aria-label={`New question in ${r.section.label}`}
                        placeholder="Add a question for this day"
                        value={newQ[r.section.template_id]?.label ?? ''}
                        onChange={(e) => setNewQ({ ...newQ, [r.section.template_id]: { label: e.target.value, type: newQ[r.section.template_id]?.type ?? 'text' } })}
                      />
                      <select
                        className="adv-field"
                        style={{ width: 130, height: 32 }}
                        aria-label="Answer type"
                        value={newQ[r.section.template_id]?.type ?? 'text'}
                        onChange={(e) => setNewQ({ ...newQ, [r.section.template_id]: { label: newQ[r.section.template_id]?.label ?? '', type: e.target.value } })}
                      >
                        {QUESTION_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                      <button type="submit" className="adv-btn adv-btn-sm"><Plus size={13} aria-hidden /> Add</button>
                    </form>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {addingSection ? (
          <div style={{ border: '1px solid var(--lp-border)', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="adv-row-flex">
              <span className="adv-grow" style={{ fontSize: 'var(--lp-text-sm)', fontWeight: 600 }}>Add a section</span>
              <button type="button" className="adv-btn adv-btn-sm adv-btn-ghost" aria-label="Close" onClick={() => setAddingSection(false)}><X size={14} aria-hidden /></button>
            </div>
            <div className="adv-row-flex" style={{ gap: 6 }}>
              {library === null ? <span className="adv-muted" style={{ fontSize: 'var(--lp-text-sm)' }}>Loading…</span> : null}
              {(library ?? [])
                .filter((l) => !rows.some((r) => r.section.template_id === l.template_id) && !isLinkedSection(l) && !isContactSection(l))
                .map((l) => (
                  <button key={l.template_id} type="button" className="adv-chip" onClick={() => setRows((rs) => [...rs, { section: l, on: true, open: false }])}>
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
                const id = `day_section_${label.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 30)}_${rows.length}`;
                setRows((rs) => [...rs, { section: { template_id: id, label, fields: [] }, on: true, open: true }]);
                setNewSection('');
              }}
            >
              <input className="adv-field" style={{ flex: 1 }} aria-label="Your own section" placeholder="Or your own section — e.g. Ferry" value={newSection} onChange={(e) => setNewSection(e.target.value)} />
              <button type="submit" className="adv-btn adv-btn-sm">Add section</button>
            </form>
          </div>
        ) : (
          <button type="button" className="adv-link" style={{ alignSelf: 'flex-start' }} onClick={() => void loadLibrary()}>
            <Plus size={13} aria-hidden /> Add a section
          </button>
        )}
      </div>
    </SlideOver>
  );
}

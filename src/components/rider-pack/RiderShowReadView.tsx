/* ============================================
   LOWPASS — Rider · Show Read/Fill View (§RA9)

   Show-mode surface: the pack's sections as filled cards where you ENTER
   VALUES (vs the builder, which edits structure). Slimmer mirror of
   src/components/advance/AdvanceShowReadView.tsx (1487 LOC):
   - amber-dashed "missing" / emerald-edge "filled" field treatment
     (AdvanceShowReadView.tsx:11-12, :168-169, :658-721)
   - per-section card chrome (:1142) + a Saved pill (:1369)

   Reuse (the spec's "lift renderers from PackEditor" point): the per-type
   value editors come from FieldEditors.tsx — Dispatcher renders the right
   editor for all 9 rider Field types, and isFieldConsideredEmpty is the
   missing detector. We render a STATIC label + Dispatcher (not the
   builder's FieldEditor, which also edits the label / structure).

   UI/UX consult (§RA9): compared full-dashed-border vs left-accent-bar
   vs background-tint for status. Chose HYBRID — missing = full amber
   dashed border + an "Needs info" icon+text affordance (color-not-only,
   actionable); filled = thin emerald left edge (calm). Background tint
   rejected: it cuts input contrast (the §RA9 halt criterion).

   Rider adaptations (data-shape): only section_type==='fields' has a
   field list; rich_text / channel_list / advance_summary keep their
   bodies in metadata and are edited in dedicated surfaces, so those
   cards show a muted note. Inheritance resolution (getPackResolved) is
   out of scope here — this fills the pack's OWN sections (getPackRaw),
   matching the builder.
   ============================================ */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, AlertTriangle, Loader2, CheckCircle2 } from 'lucide-react';
import { getPackRaw, updateSection } from '@/lib/rider-packs/client';
import type { Field, RiderSection, SectionType } from '@/lib/rider-packs/types';
import { Dispatcher, isFieldConsideredEmpty } from './FieldEditors';
import type { PackContext } from './AssetPicker';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const SECTION_TYPE_LABEL: Record<SectionType, string> = {
  fields: 'fields',
  channel_list: 'channel list',
  rich_text: 'rich text',
  advance_summary: 'advance summary',
};

export function RiderShowReadView({ packId }: { packId: string }) {
  const [sections, setSections] = useState<RiderSection[] | null>(null);
  const [packCtx, setPackCtx] = useState<PackContext | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>('idle');
  const sectionsRef = useRef<RiderSection[] | null>(null);
  useEffect(() => {
    sectionsRef.current = sections;
  }, [sections]);

  useEffect(() => {
    let alive = true;
    getPackRaw(packId)
      .then(({ pack, sections }) => {
        if (!alive) return;
        setSections([...sections].sort((a, b) => a.sort_order - b.sort_order));
        setPackCtx({
          workspaceId: pack.workspace_id,
          artistId: pack.artist_id,
          scope: pack.scope,
          tourId: pack.tour_id,
          routingId: pack.routing_id,
        });
      })
      .catch((e: Error) => {
        if (alive) setLoadError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [packId]);

  // Local optimistic field edit; persistence happens on blur.
  const updateFieldValue = useCallback((sectionId: string, key: string, next: Field) => {
    setSections((prev) =>
      prev?.map((s) =>
        s.id === sectionId ? { ...s, fields: (s.fields ?? []).map((f) => (f.key === key ? next : f)) } : s,
      ) ?? prev,
    );
  }, []);

  const persistSection = useCallback(
    async (sectionId: string) => {
      const section = (sectionsRef.current ?? []).find((s) => s.id === sectionId);
      if (!section) return;
      setSave('saving');
      try {
        await updateSection(packId, sectionId, { fields: section.fields });
        setSave('saved');
      } catch {
        setSave('error');
      }
    },
    [packId],
  );

  if (loadError) {
    return (
      <Notice icon={<AlertCircle className="h-4 w-4" />}>Couldn’t load this rider: {loadError}</Notice>
    );
  }
  if (sections === null || packCtx === null) {
    return (
      <Notice icon={<Loader2 className="h-4 w-4 animate-spin" />} center>
        Loading rider…
      </Notice>
    );
  }
  if (sections.length === 0) {
    return (
      <Notice center>This rider has no sections yet. Switch to Builder mode to add some.</Notice>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end" style={{ height: 16 }}>
        <SavePill state={save} />
      </div>
      {sections.map((section) => (
        <SectionCard
          key={section.id}
          section={section}
          packContext={packCtx}
          onChangeField={(key, next) => updateFieldValue(section.id, key, next)}
          onBlur={() => void persistSection(section.id)}
        />
      ))}
    </div>
  );
}

function Notice({ icon, center, children }: { icon?: React.ReactNode; center?: boolean; children: React.ReactNode }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-xl border p-4 ${center ? 'justify-center p-8' : ''}`}
      style={{ borderColor: 'var(--lp-border-subtle)', background: 'var(--lp-surface)', color: 'var(--lp-text-tertiary)', fontSize: '13px' }}
    >
      {icon}
      {children}
    </div>
  );
}

function SavePill({ state }: { state: SaveState }) {
  if (state === 'idle') return null;
  const text = state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved ✓' : 'Save failed';
  const color =
    state === 'saving'
      ? 'var(--lp-text-tertiary)'
      : state === 'saved'
        ? 'var(--color-lp-status-complete)'
        : 'var(--color-lp-status-needs-review)';
  return (
    <span className="inline-flex items-center gap-1.5" style={{ fontSize: '11px', color }}>
      {state === 'saving' ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
      {text}
    </span>
  );
}

interface SectionCardProps {
  section: RiderSection;
  packContext: PackContext;
  onChangeField: (key: string, next: Field) => void;
  onBlur: () => void;
}

function SectionCard({ section, packContext, onChangeField, onBlur }: SectionCardProps) {
  const sectionType: SectionType = section.section_type ?? 'fields';
  const isFieldType = sectionType === 'fields';
  const fields = section.fields ?? [];
  const total = fields.length;
  const filled = fields.filter((f) => !isFieldConsideredEmpty(f)).length;
  const allComplete = total > 0 && filled === total;

  return (
    <section
      className="overflow-hidden rounded-xl border"
      style={{ borderColor: 'var(--lp-border-strong)', background: 'var(--lp-surface)' }}
    >
      {/* Card header — title + completion. */}
      <header
        className="flex items-center justify-between"
        style={{ padding: '12px 16px', borderBottom: '1px solid var(--lp-border-subtle)' }}
      >
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--lp-text)' }}>{section.title}</h3>
        {isFieldType ? (
          <span
            className="inline-flex items-center gap-1.5"
            style={{ fontSize: '11px', color: allComplete ? 'var(--color-lp-status-complete)' : 'var(--lp-text-tertiary)' }}
          >
            {allComplete ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
            <span className="lp-mono">{filled}</span> of <span className="lp-mono">{total}</span> complete
          </span>
        ) : (
          <span className="lp-mono" style={{ fontSize: '11px', color: 'var(--lp-text-tertiary)' }}>
            {SECTION_TYPE_LABEL[sectionType]}
          </span>
        )}
      </header>

      <div style={{ padding: 12 }}>
        {!isFieldType ? (
          <p style={{ fontSize: '12px', color: 'var(--lp-text-tertiary)' }}>
            {SECTION_TYPE_LABEL[sectionType]} section — filled in its dedicated surface.
          </p>
        ) : total === 0 ? (
          <p style={{ fontSize: '12px', color: 'var(--lp-text-tertiary)', fontStyle: 'italic' }}>
            No fields in this section.
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {fields.map((f) => (
              <FieldRow
                key={f.key}
                field={f}
                packContext={packContext}
                onChange={(next) => onChangeField(f.key, next)}
                onBlur={onBlur}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

interface FieldRowProps {
  field: Field;
  packContext: PackContext;
  onChange: (next: Field) => void;
  onBlur: () => void;
}

function FieldRow({ field, packContext, onChange, onBlur }: FieldRowProps) {
  const empty = isFieldConsideredEmpty(field);
  return (
    <div
      style={{
        borderRadius: 8,
        padding: '10px 12px',
        background: 'var(--lp-bg-deep)',
        // Missing → full amber dashed border; filled → thin emerald left edge.
        border: empty
          ? '1px dashed var(--color-lp-status-needs-review)'
          : '1px solid var(--lp-border-subtle)',
        borderLeft: empty
          ? '1px dashed var(--color-lp-status-needs-review)'
          : '3px solid var(--color-lp-status-complete)',
      }}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--lp-text)' }}>
          {field.label || field.key}
        </label>
        {empty ? (
          <span
            className="inline-flex items-center gap-1"
            style={{ fontSize: '10px', fontWeight: 500, color: 'var(--color-lp-status-needs-review)' }}
          >
            <AlertTriangle className="h-3 w-3" />
            Needs info
          </span>
        ) : null}
      </div>
      <Dispatcher field={field} onChange={onChange} onFieldBlur={onBlur} tourId={packContext.tourId} packContext={packContext} />
    </div>
  );
}

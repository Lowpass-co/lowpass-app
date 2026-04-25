'use client';

/* ============================================
   LOWPASS — Rider/Pack editor shell

   Three-pane layout:
   - Left:   section list (add/remove/reorder/select)
   - Center: section editor (title + fields)
   - Right:  inspector (pack metadata + inheritance badge + actions)

   Fetches the resolved view once on mount. Each section row
   carries an `inherited_from` tag:
     null       → authored at this scope (editable)
     'tour'     → inherited from tour (click to override)
     'artist'   → inherited from artist (click to override)
   ============================================ */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { BrandedSelect } from '@/components/ui/BrandedSelect';
import type {
  Field,
  RiderPack,
  RiderSection,
  ResolvedPack,
  ResolvedSection,
} from '@/lib/rider-packs/types';
import {
  createSection,
  createWebLink,
  deletePack,
  deleteSection,
  getPackResolved,
  listWebLinks,
  revokeWebLink,
  updatePack,
  updateSection,
  type WebLink,
} from '@/lib/rider-packs/client';
import {
  FIELD_TYPE_LABELS,
  FieldEditor,
  makeDefaultField,
} from './FieldEditors';
import type { PackContext } from './AssetPicker';
import { RiderTemplateSuggestions } from './RiderTemplateSuggestions';
import { useDebouncedSave } from '@/hooks/useDebouncedSave';
import NewSectionDialog from './NewSectionDialog';
import { formatRelativeTime } from '@/lib/format-relative';
import { PackStatCards } from './PackStatCards';
import { SaveStatePill, type SavePillState } from './SaveStatePill';
import ChannelListEditor from './ChannelListEditor';
import { makeUniqueSectionKey } from '@/lib/rider-packs/templates';

type Props = {
  packId: string;
};

type SectionSavePayload = Partial<Pick<ResolvedSection, 'title' | 'sort_order' | 'fields' | 'section_key'>> & {
  sectionId: string;
};

type SectionEditorBaseProps = {
  section: ResolvedSection;
  tourId: string | null;
  packContext: PackContext;
  savePill: { state: SavePillState; error: string | null };
  onTitleCommit: (title: string) => void;
  onFieldsChange: (fields: Field[]) => void;
  onFieldBlur: () => void;
  onRemove: () => void;
  onOverride: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
};

export function PackEditor({ packId }: Props) {
  const [data, setData] = useState<ResolvedPack | null>(null);
  const [selected, setSelected] = useState<string | null>(null); // section_key
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newSectionOpen, setNewSectionOpen] = useState(false);
  const [newSectionDialogKey, setNewSectionDialogKey] = useState(0);
  const [packTitleDraft, setPackTitleDraft] = useState('');
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [exportingDoc, setExportingDoc] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);

  const dataRef = useRef<ResolvedPack | null>(null);
  dataRef.current = data;

  const refresh = useCallback(async () => {
    try {
      const r = await getPackResolved(packId);
      setData(r);
      setSelected((prev) => prev ?? r.sections[0]?.section_key ?? null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [packId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!data) return;
    setPackTitleDraft(data.pack.title ?? '');
  }, [data?.pack.id, data?.pack.title]);

  useEffect(() => {
    if (!moreMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setMoreMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [moreMenuOpen]);

  const selectedSection = useMemo(
    () => data?.sections.find((s) => s.section_key === selected) ?? null,
    [data, selected],
  );
  const selectedIsChannelList =
    (selectedSection?.section_type ?? 'fields') === 'channel_list';

  const commitPackTitle = useCallback(async () => {
    if (!data) return;
    if ((data.pack.title ?? '') === (packTitleDraft || '').trim()) return;
    try {
      await updatePack(data.pack.id, { title: packTitleDraft.trim() || null });
      setData((prev) =>
        prev ? { ...prev, pack: { ...prev.pack, title: packTitleDraft.trim() || null } } : prev,
      );
      setError(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to save title');
    }
  }, [data, packTitleDraft]);

  const runGoogleDocExport = useCallback(async () => {
    if (!data) return;
    setExportingDoc(true);
    setExportError(null);
    try {
      const res = await fetch(`/api/rider-packs/${data.pack.id}/export/google-doc`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setExportError((body?.error as string) || res.statusText || 'Export failed');
        return;
      }
      await refresh();
      if (body?.document_url) {
        window.open(body.document_url as string, '_blank', 'noopener,noreferrer');
      }
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExportingDoc(false);
    }
  }, [data, refresh]);

  const focusSharePanel = useCallback(() => {
    document.getElementById('rider-pack-share')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, []);

  /** Field-level saves are optimistic; structural changes (add/remove/reorder) call `refresh()` separately. */
  const saveSection = useCallback(
    async (payload: SectionSavePayload) => {
      const { sectionId, title, sort_order, fields, section_key } = payload;
      const restCount = [title, sort_order, fields, section_key].filter((v) => v !== undefined).length;
      if (restCount === 0) return;
      const sec = dataRef.current?.sections.find((x) => x.id === sectionId);
      if (!sec || sec.inherited_from) {
        if (sec?.inherited_from) {
          alert('This section is inherited. Override it first.');
        }
        return;
      }
      const body: Partial<Pick<RiderSection, 'title' | 'sort_order' | 'fields' | 'section_key'>> = {};
      if (title !== undefined) body.title = title;
      if (sort_order !== undefined) body.sort_order = sort_order;
      if (fields !== undefined) body.fields = fields;
      if (section_key !== undefined) body.section_key = section_key;
      if (Object.keys(body).length === 0) return;
      const updated = await updateSection(packId, sectionId, body);
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          pack: { ...prev.pack, updated_at: new Date().toISOString() },
          sections: prev.sections.map((s) =>
            s.id === sectionId
              ? { ...s, ...updated, inherited_from: s.inherited_from, source_pack_id: s.source_pack_id }
              : s,
          ),
        };
      });
    },
    [packId],
  );

  const [savePill, setSavePill] = useState<{ state: SavePillState; error: string | null }>({
    state: 'idle',
    error: null,
  });
  const savedResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSectionSave = useCallback(
    async (payload: SectionSavePayload) => {
      if (savedResetTimer.current) {
        clearTimeout(savedResetTimer.current);
        savedResetTimer.current = null;
      }
      setSavePill({ state: 'saving', error: null });
      try {
        await saveSection(payload);
        setSavePill({ state: 'saved', error: null });
        savedResetTimer.current = setTimeout(() => setSavePill({ state: 'idle', error: null }), 1500);
      } catch (e) {
        setSavePill({ state: 'error', error: e instanceof Error ? e.message : 'Save failed' });
      }
    },
    [saveSection],
  );

  const { schedule: debouncedRunSave, flush: flushSectionSave } = useDebouncedSave(
    runSectionSave,
    400,
  );
  const sectionMergeRef = useRef<Partial<SectionSavePayload> & { sectionId: string }>({ sectionId: '' });

  const scheduleSectionSave = useCallback(
    (patch: Partial<SectionSavePayload> & { sectionId: string }) => {
      sectionMergeRef.current = { ...sectionMergeRef.current, ...patch };
      setSavePill((p) => (p.state === 'saving' ? p : { state: 'pending', error: null }));
      debouncedRunSave(sectionMergeRef.current as SectionSavePayload);
    },
    [debouncedRunSave],
  );

  const prevSelectedKey = useRef<string | null>(null);
  const flushRef = useRef(flushSectionSave);
  flushRef.current = flushSectionSave;
  useEffect(() => {
    if (prevSelectedKey.current !== null && prevSelectedKey.current !== selected) {
      void flushRef.current();
    }
    prevSelectedKey.current = selected;
    if (selectedSection) {
      sectionMergeRef.current = { sectionId: selectedSection.id };
    }
  }, [selected, selectedSection]);

  // ----- Section mutations -----

  const handleAddSection = async ({
    sectionKey,
    title,
    section_type = 'fields',
  }: {
    sectionKey: string;
    title: string;
    section_type?: 'fields' | 'channel_list';
  }) => {
    if (!data) return;
    const normalizedKey = sectionKey.trim();
    const normalizedTitle = title.trim() || normalizedKey;
    if (!normalizedKey) return;
    const existingKeys = new Set(data.sections.map((s) => s.section_key));
    const uniqueKey = makeUniqueSectionKey(normalizedKey, existingKeys);
    try {
      const created = await createSection(packId, {
        section_key: uniqueKey,
        title: normalizedTitle,
        sort_order: (data.sections[data.sections.length - 1]?.sort_order ?? 0) + 10,
        fields: [],
        section_type,
      });
      await refresh();
      setSelected(created.section_key);
      setNewSectionOpen(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to add section');
    }
  };

  const handleRemoveSection = async (section: ResolvedSection) => {
    if (section.inherited_from) {
      alert('This section is inherited. To remove it here, override it first.');
      return;
    }
    if (!confirm(`Remove section "${section.title}"?`)) return;
    try {
      await deleteSection(packId, section.id);
      setSelected(null);
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to remove section');
    }
  };

  const handleOverrideSection = async (section: ResolvedSection) => {
    // Create a local row at this pack's scope, copying the inherited content.
    try {
      await createSection(packId, {
        section_key: section.section_key,
        title: section.title,
        sort_order: section.sort_order,
        fields: section.fields,
        section_type: section.section_type,
      });
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to override');
    }
  };

  const handleMoveSection = async (section: ResolvedSection, dir: -1 | 1) => {
    if (!data) return;
    if (section.inherited_from) {
      alert('This section is inherited. Override it here before reordering.');
      return;
    }
    const ownedSections = data.sections.filter((s) => !s.inherited_from);
    const idx = ownedSections.findIndex((s) => s.section_key === section.section_key);
    const swapIdx = idx + dir;
    if (idx === -1 || swapIdx < 0 || swapIdx >= ownedSections.length) return;
    const other = ownedSections[swapIdx];
    if (other.inherited_from) return;
    try {
      await Promise.all([
        updateSection(packId, section.id, { sort_order: other.sort_order }),
        updateSection(packId, other.id, { sort_order: section.sort_order }),
      ]);
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to reorder');
    }
  };

  // ----- Render -----

  if (loading) return <div className="p-6 text-sm text-lp-text-secondary">Loading...</div>;
  if (error) return <div className="p-6 text-sm text-lp-error">{error}</div>;
  if (!data) return null;

  const packContext: PackContext = {
    workspaceId: data.pack.workspace_id,
    artistId: data.pack.artist_id,
    scope: data.pack.scope,
    tourId: data.pack.tour_id,
    routingId: data.pack.routing_id,
  };

  const handleDeletePack = async () => {
    if (!data) return;
    if (!confirm('Delete this pack? This cannot be undone.')) return;
    try {
      await deletePack(packId);
      window.location.href = '/rider-packs';
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to delete');
    }
  };

  return (
    <div className="flex h-[calc(100vh-120px)] min-h-0 flex-col border-t border-lp-border bg-lp-surface">
      <div className="shrink-0 space-y-4 border-b border-lp-border bg-lp-surface px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <input
            type="text"
            value={packTitleDraft}
            onChange={(e) => setPackTitleDraft(e.target.value)}
            onBlur={() => {
              void commitPackTitle();
            }}
            className="min-w-0 flex-1 border-0 border-b border-transparent bg-transparent text-2xl font-semibold text-lp-text outline-none focus:border-lp-border"
            placeholder="Untitled pack"
            aria-label="Pack title"
          />
          <span className="shrink-0 rounded-full border border-lp-border bg-lp-surface-hover px-2.5 py-1 text-xs font-semibold uppercase text-lp-text">
            {data.pack.scope}
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={focusSharePanel}
            className="rounded-lg bg-lp-orange px-4 py-2 text-sm font-medium text-white hover:bg-lp-orange/90"
          >
            Share
          </button>
          <button
            type="button"
            onClick={() => {
              void runGoogleDocExport();
            }}
            disabled={exportingDoc}
            className="rounded-lg border border-lp-border bg-transparent px-4 py-2 text-sm font-medium text-lp-text hover:bg-lp-surface-hover disabled:opacity-50"
          >
            {exportingDoc ? 'Exporting…' : 'Export'}
          </button>
          <div className="relative" ref={moreMenuRef}>
            <button
              type="button"
              onClick={() => setMoreMenuOpen((o) => !o)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-lp-border text-lp-text hover:bg-lp-surface-hover"
              aria-label="More actions"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {moreMenuOpen && (
              <div className="absolute right-0 z-50 mt-1 min-w-[180px] rounded-xl border border-lp-border bg-lp-surface py-1 shadow-lg">
                <button
                  type="button"
                  onClick={() => {
                    setMoreMenuOpen(false);
                    void handleDeletePack();
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-lp-error hover:bg-lp-surface-hover"
                >
                  Delete pack
                </button>
              </div>
            )}
          </div>
        </div>
        {exportError && <div className="text-sm text-lp-error">{exportError}</div>}
        <PackStatCards
          packId={packId}
          packUpdatedAt={data.pack.updated_at}
          sections={data.sections}
          onShareClick={focusSharePanel}
        />
      </div>
      <div className="shrink-0 border-b border-lp-border px-4 py-3">
        <RiderTemplateSuggestions
          packId={packId}
          sections={data.sections}
          onApplied={() => refresh()}
        />
      </div>
      <div className="shrink-0 border-b border-lp-border bg-lp-surface px-4 py-3">
        <Inspector
          pack={data.pack}
          lastEditLabel={formatRelativeTime(data.pack.updated_at)}
          onExportGoogleDoc={runGoogleDocExport}
          exportingDoc={exportingDoc}
          exportError={exportError}
          onPackDelete={handleDeletePack}
        />
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 lg:grid-cols-[220px_1fr]">
      {/* LEFT: section list */}
      <aside className="overflow-y-auto border-r border-lp-border bg-lp-surface">
        <div className="p-3 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-widest text-lp-text-tertiary">Sections</span>
          <button
            type="button"
            onClick={() => {
              setNewSectionDialogKey((current) => current + 1);
              setNewSectionOpen(true);
            }}
            className="text-xs text-[var(--lp-orange)] hover:underline"
          >
            + add
          </button>
        </div>
        <ul>
          {data.sections.map((s) => (
            <li key={s.section_key}>
              <button
                type="button"
                onClick={() => setSelected(s.section_key)}
                className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 border-l-2 ${
                  selected === s.section_key
                    ? 'border-[var(--lp-orange)] bg-lp-surface-hover'
                    : 'border-transparent hover:bg-lp-surface-hover'
                }`}
              >
                <span className="truncate">{s.title}</span>
                {s.inherited_from && (
                  <span className="text-[10px] uppercase tracking-wide text-lp-text-tertiary">
                    {s.inherited_from === 'artist' ? 'artist' : 'tour'}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* CENTER: section editor */}
      <main
        className={
          selectedIsChannelList
            ? 'min-h-0 min-w-0 flex-1 overflow-y-auto bg-lp-surface-hover p-0 sm:p-2'
            : 'min-h-0 flex-1 overflow-y-auto bg-lp-surface-hover p-4 lg:p-6'
        }
      >
        {!selectedSection ? (
          <div className="p-2 text-sm text-lp-text-secondary sm:p-4">
            Select a section, or add a new one.
          </div>
        ) : (selectedSection.section_type ?? 'fields') === 'channel_list' ? (
          <ChannelListEditor
            key={selectedSection.id}
            section={selectedSection}
            pack={data.pack}
            savePill={savePill}
            onTitleCommit={(title) => {
              setData((prev) => {
                if (!prev) return prev;
                return {
                  ...prev,
                  sections: prev.sections.map((s) =>
                    s.id === selectedSection.id ? { ...s, title } : s,
                  ),
                };
              });
              scheduleSectionSave({ sectionId: selectedSection.id, title });
              void flushSectionSave();
            }}
            onFieldBlur={() => {
              void flushSectionSave();
            }}
            onRemove={() => handleRemoveSection(selectedSection)}
            onOverride={() => handleOverrideSection(selectedSection)}
            onMoveUp={() => handleMoveSection(selectedSection, -1)}
            onMoveDown={() => handleMoveSection(selectedSection, 1)}
            onStructureChange={() => void refresh()}
          />
        ) : (
          <SectionEditor
            key={selectedSection.id}
            section={selectedSection}
            tourId={data.pack.tour_id}
            packContext={packContext}
            savePill={savePill}
            onTitleCommit={(title) => {
              setData((prev) => {
                if (!prev) return prev;
                return {
                  ...prev,
                  sections: prev.sections.map((s) =>
                    s.id === selectedSection.id ? { ...s, title } : s,
                  ),
                };
              });
              scheduleSectionSave({ sectionId: selectedSection.id, title });
              void flushSectionSave();
            }}
            onFieldsChange={(fields) => {
              setData((prev) => {
                if (!prev) return prev;
                return {
                  ...prev,
                  sections: prev.sections.map((s) =>
                    s.id === selectedSection.id ? { ...s, fields } : s,
                  ),
                };
              });
              scheduleSectionSave({ sectionId: selectedSection.id, fields });
            }}
            onFieldBlur={() => {
              void flushSectionSave();
            }}
            onRemove={() => handleRemoveSection(selectedSection)}
            onOverride={() => handleOverrideSection(selectedSection)}
            onMoveUp={() => handleMoveSection(selectedSection, -1)}
            onMoveDown={() => handleMoveSection(selectedSection, 1)}
          />
        )}
      </main>
      </div>
      <NewSectionDialog
        key={newSectionDialogKey}
        open={newSectionOpen}
        onClose={() => setNewSectionOpen(false)}
        onSubmit={handleAddSection}
      />
    </div>
  );
}

function SectionEditor({
  section,
  tourId,
  packContext,
  savePill,
  onTitleCommit,
  onFieldsChange,
  onFieldBlur,
  onRemove,
  onOverride,
  onMoveUp,
  onMoveDown,
}: SectionEditorBaseProps) {
  const [titleDraft, setTitleDraft] = useState(section.title);
  useEffect(() => {
    setTitleDraft(section.title);
  }, [section.title]);

  const inherited = !!section.inherited_from;
  const fields = section.fields ?? [];

  return (
    <div
      className="mx-auto max-w-3xl overflow-hidden rounded-xl border"
      style={{ backgroundColor: 'var(--lp-surface)', borderColor: 'var(--lp-border)' }}
    >
      <div
        className="flex items-center justify-between gap-2 border-b px-4 py-3"
        style={{ borderColor: 'var(--lp-border)' }}
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <input
            type="text"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => {
              if (titleDraft !== section.title && !inherited) onTitleCommit(titleDraft);
            }}
            disabled={inherited}
            className="min-w-0 max-w-md flex-1 border-b border-transparent bg-transparent text-sm font-semibold text-lp-text outline-none focus:border-lp-border disabled:text-lp-text-tertiary"
            placeholder="Section title"
          />
          <SaveStatePill state={savePill.state} error={savePill.error} />
        </div>
        <div className="flex shrink-0 items-center gap-1 text-xs">
          <button
            type="button"
            onClick={onMoveUp}
            className="rounded border border-lp-border px-2 py-1 hover:bg-lp-surface-hover"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            className="rounded border border-lp-border px-2 py-1 hover:bg-lp-surface-hover"
          >
            ↓
          </button>
          {inherited ? (
            <button
              type="button"
              onClick={onOverride}
              className="rounded bg-[var(--lp-orange)] px-2 py-1 text-white hover:opacity-90"
            >
              Override
            </button>
          ) : (
            <button
              type="button"
              onClick={onRemove}
              className="rounded border border-lp-border px-2 py-1 text-lp-error hover:opacity-90"
              style={{ backgroundColor: 'rgba(239,68,68,0.1)' }}
            >
              Remove
            </button>
          )}
        </div>
      </div>
      {inherited && (
        <div className="border-b px-4 py-2 text-xs text-lp-text-secondary" style={{ borderColor: 'var(--lp-border)' }}>
          Inherited from {section.inherited_from}. Override to edit here.
        </div>
      )}

      <fieldset disabled={inherited} className={inherited ? 'pointer-events-none opacity-60' : ''}>
        <div className="rounded-xl border border-lp-border bg-lp-surface overflow-hidden">
          {fields.map((f, i) => (
            <FieldEditor
              key={f.key}
              field={f}
              tourId={tourId}
              packContext={packContext}
              isLast={i === fields.length - 1}
              onFieldBlur={onFieldBlur}
              onChange={(next) => {
                const copy = [...fields];
                copy[i] = next;
                onFieldsChange(copy);
              }}
              onRemove={() => onFieldsChange(fields.filter((_, j) => j !== i))}
              onDuplicate={() => {
                const clone = structuredClone(f) as Field;
                clone.key = `f_${Date.now().toString(36)}`;
                onFieldsChange([...fields.slice(0, i + 1), clone, ...fields.slice(i + 1)]);
              }}
            />
          ))}
        </div>
        <div className="px-0 pb-4 pt-3">
          <AddFieldDropdown onAdd={(type) => onFieldsChange([...fields, makeDefaultField(type)])} />
        </div>
      </fieldset>
    </div>
  );
}

function AddFieldDropdown({ onAdd }: { onAdd: (type: Field['type']) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded border border-dashed border-lp-border px-3 py-2 text-sm text-lp-text-secondary hover:bg-lp-surface-hover"
      >
        + Add field
      </button>
      {open && (
        <div className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-xl border border-lp-border bg-lp-surface p-2">
          {(Object.keys(FIELD_TYPE_LABELS) as Field['type'][]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                onAdd(t);
                setOpen(false);
              }}
              className="w-full rounded-lg px-3 py-2 text-left text-sm text-lp-text hover:bg-lp-surface-hover"
            >
              {FIELD_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Inspector({
  pack,
  lastEditLabel,
  onExportGoogleDoc,
  exportingDoc,
  exportError,
  onPackDelete,
}: {
  pack: RiderPack;
  lastEditLabel: string;
  onExportGoogleDoc: () => void | Promise<void>;
  exportingDoc: boolean;
  exportError: string | null;
  onPackDelete: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 text-sm text-lp-text lg:flex-row lg:flex-wrap lg:items-start lg:gap-x-8 lg:gap-y-3">
      <div className="flex min-w-0 flex-wrap items-end gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-lp-text-tertiary">Last edit</div>
          <p className="mt-1 text-sm text-lp-text" title={pack.updated_at ?? undefined}>
            {lastEditLabel}
          </p>
        </div>
      </div>

      <div className="min-w-0 flex-1 lg:max-w-md">
        <ExportPanel
          pack={pack}
          onExport={onExportGoogleDoc}
          busy={exportingDoc}
          error={exportError}
        />
      </div>

      <div id="rider-pack-share" className="min-w-0 flex-1 lg:max-w-md">
        <SharingPanel packId={pack.id} />
      </div>

      <button
        type="button"
        onClick={onPackDelete}
        className="text-xs text-lp-text-secondary hover:text-lp-error lg:ml-auto"
      >
        Delete pack
      </button>
    </div>
  );
}

// ============================================================
// NewPackForm — small client form for the /rider-packs index page.
// Exported from this file so page.tsx (a server component) can import
// a ready-made client component without needing its own file.
// ============================================================
export function NewPackForm({
  artists,
  lockArtist,
}: {
  artists: { id: string; name: string }[];
  /** When set (e.g. from tour/artist context), the band select is hidden. */
  lockArtist?: { id: string; name: string } | null;
}) {
  const [artistId, setArtistId] = useState(
    () => lockArtist?.id ?? artists[0]?.id ?? '',
  );
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const artistOptions = useMemo(
    () => artists.map((a) => ({ value: a.id, label: a.name })),
    [artists],
  );

  const effectiveArtistId = lockArtist ? lockArtist.id : artistId;

  const submit = async () => {
    if (!effectiveArtistId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/rider-packs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: 'artist',
          artist_id: effectiveArtistId,
          title: title || null,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof j.error === 'string' ? j.error : 'Failed to create pack');
        return;
      }
      const pack = j;
      window.location.href = `/rider-packs/${pack.id}`;
    } finally {
      setSubmitting(false);
    }
  };

  if (artists.length === 0) {
    return (
      <div className="p-4 text-xs text-lp-text-secondary">
        No artists in this workspace yet. Create one first.
      </div>
    );
  }

  if (lockArtist && !artists.some((a) => a.id === lockArtist.id)) {
    return (
      <div className="p-4 text-xs text-lp-text-secondary">
        Artist is not in this workspace.
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4">
      {lockArtist && (
        <p className="text-sm font-medium text-lp-text">
          Create new {lockArtist.name} rider
          <span className="ml-0.5 font-normal text-lp-text-tertiary">?</span>
        </p>
      )}
      {error && (
        <div
          className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200"
          role="alert"
        >
          {error}
        </div>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        {!lockArtist && (
          <div className="w-full min-w-0 sm:w-56 sm:shrink-0">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary">
              Artist
            </div>
            <BrandedSelect
              value={artistId}
              onChange={setArtistId}
              options={artistOptions}
              placeholder="Select artist…"
              ariaLabel="Artist for new rider"
              className="w-full"
              minWidth={0}
            />
          </div>
        )}
        <label className="block w-full min-w-0 sm:max-w-md">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary">
            Title (optional)
          </div>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-9 w-full rounded-lg border border-lp-border bg-lp-bg px-3 text-sm text-lp-text"
            placeholder="e.g. FOH · EU leg"
          />
        </label>
        <button
          type="button"
          onClick={submit}
          disabled={submitting || !effectiveArtistId}
          className="h-9 shrink-0 rounded-lg bg-[var(--lp-orange)] px-5 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Creating…' : 'Create'}
        </button>
      </div>
    </div>
  );
}

function SharingPanel({ packId }: { packId: string }) {
  const [links, setLinks] = useState<WebLink[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [passwordDraft, setPasswordDraft] = useState('');
  const [showPasswordField, setShowPasswordField] = useState(false);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listWebLinks(packId);
      setLinks(res.links);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load links');
    } finally {
      setLoading(false);
    }
  }, [packId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const password = showPasswordField && passwordDraft.length > 0 ? passwordDraft : null;
      const link = await createWebLink(packId, password ? { password } : {});
      await navigator.clipboard?.writeText(buildPublicUrl(link.token)).catch(() => {});
      setPasswordDraft('');
      setShowPasswordField(false);
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to create link');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (linkId: string) => {
    if (!confirm('Revoke this link? Anyone using it will lose access.')) return;
    try {
      await revokeWebLink(linkId);
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to revoke link');
    }
  };

  const handleCopy = async (linkId: string, url: string) => {
    await navigator.clipboard.writeText(url);
    setCopiedLinkId(linkId);
    setTimeout(() => setCopiedLinkId((current) => (current === linkId ? null : current)), 1500);
  };

  const active = (links ?? []).filter((l) => !l.revoked_at);
  const revoked = (links ?? []).filter((l) => l.revoked_at);

  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-lp-text-tertiary">Sharing</div>
      {loading && <div className="mt-1 text-xs text-lp-text-tertiary">Loading...</div>}
      {error && <div className="mt-1 text-xs text-lp-error">{error}</div>}
      {!loading && active.length > 0 && (
        <ul className="mt-2 space-y-2">
          {active.map((link) => (
            <li
              key={link.id}
              className="space-y-2 rounded-lg border p-3"
              style={{ backgroundColor: 'var(--lp-bg-secondary)', borderColor: 'var(--lp-border)' }}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
                  style={{
                    backgroundColor: link.has_password
                      ? 'rgba(156, 163, 175, 0.1)'
                      : 'rgba(255, 69, 0, 0.1)',
                    color: link.has_password ? '#9CA3AF' : '#FF4500',
                    border: `1px solid ${link.has_password ? 'rgba(156, 163, 175, 0.2)' : 'rgba(255, 69, 0, 0.2)'}`,
                  }}
                >
                  {link.has_password ? 'Password-protected' : 'Open'}
                </span>
                <button
                  type="button"
                  onClick={() => handleRevoke(link.id)}
                  className="text-[10px] text-lp-text-secondary hover:text-lp-error"
                >
                  Revoke
                </button>
              </div>
              <div className="font-mono text-[10px] break-all text-lp-text">/r/{link.token}</div>
              <button
                type="button"
                onClick={() => handleCopy(link.id, buildPublicUrl(link.token))}
                className="text-[10px] text-[var(--lp-orange)] hover:underline"
              >
                {copiedLinkId === link.id ? 'Copied!' : 'Copy link'}
              </button>
            </li>
          ))}
        </ul>
      )}
      {!loading && active.length === 0 && (
        <div className="px-4 py-6 text-center text-sm text-lp-text-secondary">
          No share links yet. Create one above.
        </div>
      )}

      <div className="mt-3 space-y-2">
        {showPasswordField && (
          <input
            type="text"
            value={passwordDraft}
            onChange={(e) => setPasswordDraft(e.target.value)}
            placeholder="Password for this link"
            className="w-full rounded border border-lp-border bg-lp-surface px-2 py-1 text-xs text-lp-text"
            autoFocus
          />
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating}
            className="rounded bg-[var(--lp-orange)] px-3 py-1.5 text-xs text-white hover:opacity-90 disabled:opacity-50"
          >
            {creating ? 'Creating...' : 'Create link'}
          </button>
          <label className="flex items-center gap-1 text-[10px] text-lp-text-secondary">
            <input
              type="checkbox"
              checked={showPasswordField}
              onChange={(e) => {
                setShowPasswordField(e.target.checked);
                if (!e.target.checked) setPasswordDraft('');
              }}
            />
            Protect with password
          </label>
        </div>
      </div>

      {revoked.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[10px] text-lp-text-tertiary">
            Revoked ({revoked.length})
          </summary>
          <ul className="mt-1 space-y-1">
            {revoked.map((link) => (
              <li
                key={link.id}
                className="font-mono text-[10px] text-lp-text-tertiary line-through truncate"
              >
                /r/{link.token}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function buildPublicUrl(token: string): string {
  if (typeof window === 'undefined') return `/r/${token}`;
  return `${window.location.origin}/r/${token}`;
}

function ExportPanel({
  pack,
  onExport,
  busy,
  error,
}: {
  pack: RiderPack;
  onExport: () => void | Promise<void>;
  busy: boolean;
  error: string | null;
}) {
  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase tracking-widest text-lp-text-tertiary">Google Doc</div>
      <span
        className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
        style={{
          backgroundColor: pack.google_doc_url ? 'rgba(255, 69, 0, 0.1)' : 'rgba(156, 163, 175, 0.1)',
          color: pack.google_doc_url ? '#FF4500' : '#9CA3AF',
          border: `1px solid ${pack.google_doc_url ? 'rgba(255, 69, 0, 0.2)' : 'rgba(156, 163, 175, 0.2)'}`,
        }}
      >
        {pack.google_doc_url ? 'Exported' : 'Not exported'}
      </span>

      {error && (
        <div
          className="rounded-md border px-3 py-2 text-xs"
          style={{
            backgroundColor: 'rgba(239,68,68,0.1)',
            borderColor: '#EF4444',
            color: 'var(--lp-text)',
          }}
        >
          <div className="font-semibold" style={{ color: '#EF4444' }}>
            Export failed
          </div>
          <div className="mt-0.5 text-lp-text-secondary">{error}</div>
        </div>
      )}

      <div className="mt-2">
        <button
          type="button"
          onClick={() => {
            void onExport();
          }}
          disabled={busy}
          className="rounded-lg border border-lp-border px-3 py-1.5 text-xs font-medium text-lp-text hover:bg-lp-surface-hover disabled:opacity-50"
        >
          {busy
            ? 'Exporting…'
            : pack.google_doc_url
              ? 'Re-export to Google Doc'
              : 'Export to Google Doc'}
        </button>
      </div>
      {pack.google_doc_url && (
        <a
          href={pack.google_doc_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs underline"
          style={{ color: 'var(--lp-text-secondary)' }}
        >
          Open in Google Docs ↗
        </a>
      )}
    </div>
  );
}

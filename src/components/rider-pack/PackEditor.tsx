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
import { useDebouncedSave, type SaveState } from './useDebouncedSave';
import NewSectionDialog from './NewSectionDialog';
import { formatRelativeTime } from '@/lib/format-relative';

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
  savePill: { state: SaveState; error: string | null };
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

  const selectedSection = useMemo(
    () => data?.sections.find((s) => s.section_key === selected) ?? null,
    [data, selected],
  );

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

  const sectionSave = useDebouncedSave<SectionSavePayload>(saveSection, { delay: 800 });

  const prevSelectedKey = useRef<string | null>(null);
  const flushRef = useRef(sectionSave.flush);
  flushRef.current = sectionSave.flush;
  useEffect(() => {
    if (prevSelectedKey.current !== null && prevSelectedKey.current !== selected) {
      void flushRef.current();
    }
    prevSelectedKey.current = selected;
  }, [selected]);

  // ----- Section mutations -----

  const handleAddSection = async ({ sectionKey, title }: { sectionKey: string; title: string }) => {
    if (!data) return;
    const normalizedKey = sectionKey.trim();
    const normalizedTitle = title.trim() || normalizedKey;
    if (!normalizedKey) return;
    try {
      await createSection(packId, {
        section_key: normalizedKey,
        title: normalizedTitle,
        sort_order: (data.sections[data.sections.length - 1]?.sort_order ?? 0) + 10,
        fields: [],
      });
      await refresh();
      setSelected(normalizedKey);
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

  return (
    <div className="flex h-[calc(100vh-120px)] min-h-0 flex-col border-t border-lp-border bg-lp-surface">
      <div className="shrink-0 border-b border-lp-border px-4 py-3">
        <RiderTemplateSuggestions
          packId={packId}
          sections={data.sections}
          onApplied={() => refresh()}
        />
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[220px_1fr_280px] gap-0">
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
      <main className="overflow-y-auto bg-lp-surface-hover p-6">
        {!selectedSection ? (
          <div className="text-sm text-lp-text-secondary">Select a section, or add a new one.</div>
        ) : (
          <SectionEditor
            key={selectedSection.id}
            section={selectedSection}
            tourId={data.pack.tour_id}
            packContext={packContext}
            savePill={{ state: sectionSave.state, error: sectionSave.error }}
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
              sectionSave.schedule({ sectionId: selectedSection.id, title });
              void sectionSave.flush();
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
              sectionSave.schedule({ sectionId: selectedSection.id, fields });
            }}
            onFieldBlur={() => {
              void sectionSave.flush();
            }}
            onRemove={() => handleRemoveSection(selectedSection)}
            onOverride={() => handleOverrideSection(selectedSection)}
            onMoveUp={() => handleMoveSection(selectedSection, -1)}
            onMoveDown={() => handleMoveSection(selectedSection, 1)}
          />
        )}
      </main>

      {/* RIGHT: inspector */}
      <aside className="overflow-y-auto border-l border-lp-border bg-lp-surface p-4 text-sm text-lp-text space-y-4">
        <Inspector
          pack={data.pack}
          lastEditLabel={formatRelativeTime(data.pack.updated_at)}
          onPackUpdate={() => refresh()}
          onPackDelete={async () => {
            if (!confirm('Delete this pack? This cannot be undone.')) return;
            try {
              await deletePack(packId);
              window.location.href = '/rider-packs';
            } catch (e) {
              alert(e instanceof Error ? e.message : 'Failed to delete');
            }
          }}
        />
      </aside>
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

function SaveStatePill({
  state,
  error,
}: {
  state: 'idle' | 'pending' | 'saving' | 'saved' | 'error';
  error: string | null;
}) {
  if (state === 'idle') return null;
  const config = {
    pending: { label: 'Unsaved changes', color: 'var(--lp-text-tertiary)' },
    saving: { label: 'Saving…', color: 'var(--lp-text-secondary)' },
    saved: { label: 'Saved', color: 'var(--lp-orange)' },
    error: { label: error || 'Save failed', color: 'var(--lp-error)' },
  }[state];
  return (
    <span
      title={state === 'error' && error ? error : undefined}
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
      style={{
        color: config.color,
        border: `1px solid ${config.color}`,
        backgroundColor: 'transparent',
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: config.color }} />
      {config.label}
    </span>
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
  const [lastSyncedTitle, setLastSyncedTitle] = useState(section.title);
  if (lastSyncedTitle !== section.title) {
    setLastSyncedTitle(section.title);
    setTitleDraft(section.title);
  }

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
        <div>
          {fields.map((f, i) => (
            <div
              key={f.key}
              className="border-b border-lp-border px-4 py-3 transition-colors last:border-b-0 hover:bg-lp-surface-hover"
            >
              <FieldEditor
                field={f}
                tourId={tourId}
                packContext={packContext}
                onFieldBlur={onFieldBlur}
                onChange={(next) => {
                  const copy = [...fields];
                  copy[i] = next;
                  onFieldsChange(copy);
                }}
                onRemove={() => onFieldsChange(fields.filter((_, j) => j !== i))}
              />
            </div>
          ))}
        </div>
        <div className="px-4 pb-4">
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
        <div className="mt-2 grid grid-cols-3 gap-1">
          {(Object.keys(FIELD_TYPE_LABELS) as Field['type'][]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                onAdd(t);
                setOpen(false);
              }}
              className="rounded border border-lp-border px-2 py-1 text-xs hover:bg-lp-surface-hover"
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
  onPackUpdate,
  onPackDelete,
}: {
  pack: RiderPack;
  lastEditLabel: string;
  onPackUpdate: () => void;
  onPackDelete: () => void;
}) {
  const [titleDraft, setTitleDraft] = useState(pack.title ?? '');
  // Reset draft when the upstream prop changes — derive in render rather than effect.
  const [lastSyncedTitle, setLastSyncedTitle] = useState(pack.title ?? '');
  const upstreamTitle = pack.title ?? '';
  if (lastSyncedTitle !== upstreamTitle) {
    setLastSyncedTitle(upstreamTitle);
    setTitleDraft(upstreamTitle);
  }

  const commitTitle = async () => {
    if ((pack.title ?? '') === titleDraft) return;
    try {
      await updatePack(pack.id, { title: titleDraft });
      onPackUpdate();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to save title');
    }
  };

  return (
    <>
      <div>
        <div className="text-[10px] uppercase tracking-widest text-lp-text-tertiary">Scope</div>
        <div className="mt-1 inline-flex items-center rounded-full bg-lp-surface-hover px-2 py-0.5 text-xs font-semibold uppercase text-lp-text">
          {pack.scope}
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-widest text-lp-text-tertiary">Last edit</div>
        <p className="mt-1 text-sm text-lp-text" title={pack.updated_at ?? undefined}>
          {lastEditLabel}
        </p>
      </div>

      <div>
        <label className="text-[10px] uppercase tracking-widest text-lp-text-tertiary">Title</label>
        <input
          type="text"
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={commitTitle}
          className="mt-1 w-full rounded border border-lp-border bg-lp-surface px-2 py-1 text-sm text-lp-text"
          placeholder="Untitled"
        />
      </div>

      <ExportPanel pack={pack} onExported={onPackUpdate} />

      <SharingPanel packId={pack.id} />

      <div className="border-t border-lp-border pt-4">
        <button
          type="button"
          onClick={onPackDelete}
          className="text-xs text-lp-text-secondary hover:text-lp-error"
        >
          Delete pack
        </button>
      </div>
    </>
  );
}

// ============================================================
// NewPackForm — small client form for the /rider-packs index page.
// Exported from this file so page.tsx (a server component) can import
// a ready-made client component without needing its own file.
// ============================================================
export function NewPackForm({ artists }: { artists: { id: string; name: string }[] }) {
  const [artistId, setArtistId] = useState(artists[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!artistId) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/rider-packs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'artist', artist_id: artistId, title: title || null }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? 'Failed to create pack');
        return;
      }
      const pack = await res.json();
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

  return (
    <div className="flex flex-wrap items-end gap-3 p-4">
      <label className="text-xs">
        <div className="mb-1 text-[10px] uppercase tracking-widest text-lp-text-tertiary">Artist</div>
        <select
          value={artistId}
          onChange={(e) => setArtistId(e.target.value)}
          className="rounded border border-lp-border bg-lp-surface px-2 py-1 text-sm text-lp-text"
        >
          {artists.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <label className="min-w-[200px] flex-1 text-xs">
        <div className="mb-1 text-[10px] uppercase tracking-widest text-lp-text-tertiary">
          Title (optional)
        </div>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded border border-lp-border bg-lp-surface px-2 py-1 text-sm text-lp-text"
          placeholder="e.g. FOH · EU leg"
        />
      </label>
      <button
        type="button"
        onClick={submit}
        disabled={submitting || !artistId}
        className="rounded bg-[var(--lp-orange)] px-4 py-1.5 text-sm text-white hover:opacity-90 disabled:opacity-50"
      >
        Create
      </button>
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
  onExported,
}: {
  pack: RiderPack;
  onExported: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/rider-packs/${pack.id}/export/google-doc`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        const detail = body?.error || res.statusText || 'Export failed';
        setError(detail);
        return;
      }

      onExported();
      if (body?.document_url) {
        window.open(body.document_url, '_blank', 'noopener,noreferrer');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setBusy(false);
    }
  };

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
          onClick={handleExport}
          disabled={busy}
          className="rounded bg-[var(--lp-orange)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
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

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

import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  Field,
  RiderPack,
  ResolvedPack,
  ResolvedSection,
} from '@/lib/rider-packs/types';
import {
  createSection,
  deletePack,
  deleteSection,
  getPackResolved,
  updatePack,
  updateSection,
} from '@/lib/rider-packs/client';
import {
  FIELD_TYPE_LABELS,
  FieldEditor,
  makeDefaultField,
} from './FieldEditors';
import type { PackContext } from './AssetPicker';

type Props = {
  packId: string;
};

export function PackEditor({ packId }: Props) {
  const [data, setData] = useState<ResolvedPack | null>(null);
  const [selected, setSelected] = useState<string | null>(null); // section_key
  const [error, setError] = useState<string | null>(null);
  const [savingSection, setSavingSection] = useState(false);
  const [loading, setLoading] = useState(true);

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

  // ----- Section mutations -----

  const handleAddSection = async () => {
    if (!data) return;
    const sectionKey = prompt('Section key (e.g. "hospitality"):');
    if (!sectionKey) return;
    const title = prompt('Section title:', sectionKey) ?? sectionKey;
    try {
      await createSection(packId, {
        section_key: sectionKey,
        title,
        sort_order: (data.sections[data.sections.length - 1]?.sort_order ?? 0) + 10,
        fields: [],
      });
      await refresh();
      setSelected(sectionKey);
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

  // ----- Field mutations on the selected section -----

  const saveSelectedSection = async (next: Partial<ResolvedSection>) => {
    if (!selectedSection) return;
    if (selectedSection.inherited_from) {
      alert('This section is inherited. Override it first.');
      return;
    }
    setSavingSection(true);
    try {
      await updateSection(packId, selectedSection.id, next);
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSavingSection(false);
    }
  };

  // ----- Render -----

  if (loading) return <div className="p-6 text-sm text-neutral-500">Loading...</div>;
  if (error) return <div className="p-6 text-sm text-red-600">{error}</div>;
  if (!data) return null;

  const packContext: PackContext = {
    workspaceId: data.pack.workspace_id,
    artistId: data.pack.artist_id,
    scope: data.pack.scope,
    tourId: data.pack.tour_id,
    routingId: data.pack.routing_id,
  };

  return (
    <div className="grid grid-cols-[220px_1fr_280px] gap-0 h-[calc(100vh-120px)] border-t border-neutral-200">
      {/* LEFT: section list */}
      <aside className="border-r border-neutral-200 overflow-y-auto">
        <div className="p-3 flex items-center justify-between">
          <span className="text-xs font-medium uppercase text-neutral-500">Sections</span>
          <button
            type="button"
            onClick={handleAddSection}
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
                    ? 'bg-neutral-100 border-[var(--lp-orange)]'
                    : 'border-transparent hover:bg-neutral-50'
                }`}
              >
                <span className="truncate">{s.title}</span>
                {s.inherited_from && (
                  <span className="text-[10px] uppercase tracking-wide text-neutral-400">
                    {s.inherited_from === 'artist' ? 'artist' : 'tour'}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* CENTER: section editor */}
      <main className="overflow-y-auto bg-neutral-50 p-6">
        {!selectedSection ? (
          <div className="text-sm text-neutral-500">Select a section, or add a new one.</div>
        ) : (
          <SectionEditor
            key={selectedSection.id}
            section={selectedSection}
            tourId={data.pack.tour_id}
            packContext={packContext}
            saving={savingSection}
            onTitleChange={(title) => saveSelectedSection({ title })}
            onFieldsChange={(fields) => saveSelectedSection({ fields })}
            onRemove={() => handleRemoveSection(selectedSection)}
            onOverride={() => handleOverrideSection(selectedSection)}
            onMoveUp={() => handleMoveSection(selectedSection, -1)}
            onMoveDown={() => handleMoveSection(selectedSection, 1)}
          />
        )}
      </main>

      {/* RIGHT: inspector */}
      <aside className="border-l border-neutral-200 overflow-y-auto p-4 space-y-4 text-sm">
        <Inspector
          pack={data.pack}
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
  );
}

function SectionEditor({
  section,
  tourId,
  packContext,
  saving,
  onTitleChange,
  onFieldsChange,
  onRemove,
  onOverride,
  onMoveUp,
  onMoveDown,
}: {
  section: ResolvedSection;
  tourId: string | null;
  packContext: PackContext;
  saving: boolean;
  onTitleChange: (title: string) => void;
  onFieldsChange: (fields: Field[]) => void;
  onRemove: () => void;
  onOverride: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const [titleDraft, setTitleDraft] = useState(section.title);
  // Reset draft when the upstream prop changes (e.g. after refresh) without
  // an effect — see https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const [lastSyncedTitle, setLastSyncedTitle] = useState(section.title);
  if (lastSyncedTitle !== section.title) {
    setLastSyncedTitle(section.title);
    setTitleDraft(section.title);
  }

  const inherited = !!section.inherited_from;
  const fields = section.fields ?? [];

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <input
            type="text"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => {
              if (titleDraft !== section.title && !inherited) onTitleChange(titleDraft);
            }}
            disabled={inherited}
            className="w-full text-2xl font-semibold bg-transparent outline-none border-b border-transparent focus:border-neutral-300 disabled:text-neutral-400"
          />
          <div className="mt-1 text-xs text-neutral-500">
            {inherited ? (
              <>Inherited from {section.inherited_from}. </>
            ) : (
              <>{saving ? 'Saving…' : 'Authored here.'} </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 pt-2 text-xs">
          <button
            type="button"
            onClick={onMoveUp}
            className="rounded border border-neutral-200 px-2 py-1 hover:bg-neutral-50"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            className="rounded border border-neutral-200 px-2 py-1 hover:bg-neutral-50"
          >
            ↓
          </button>
          {inherited ? (
            <button
              type="button"
              onClick={onOverride}
              className="rounded bg-[var(--lp-orange)] px-2 py-1 text-white hover:opacity-90"
            >
              Override here
            </button>
          ) : (
            <button
              type="button"
              onClick={onRemove}
              className="rounded border border-neutral-200 px-2 py-1 hover:bg-red-50 hover:text-red-600"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      <fieldset disabled={inherited} className={inherited ? 'opacity-60 pointer-events-none' : ''}>
        <div className="space-y-2">
          {fields.map((f, i) => (
            <FieldEditor
              key={i}
              field={f}
              tourId={tourId}
              packContext={packContext}
              onChange={(next) => {
                const copy = [...fields];
                copy[i] = next;
                onFieldsChange(copy);
              }}
              onRemove={() => onFieldsChange(fields.filter((_, j) => j !== i))}
            />
          ))}
        </div>
        <AddFieldDropdown onAdd={(type) => onFieldsChange([...fields, makeDefaultField(type)])} />
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
        className="rounded border border-dashed border-neutral-300 px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-50"
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
              className="rounded border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50"
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
  onPackUpdate,
  onPackDelete,
}: {
  pack: RiderPack;
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
        <div className="text-[10px] uppercase tracking-wide text-neutral-400">Scope</div>
        <div className="mt-1 inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium uppercase">
          {pack.scope}
        </div>
      </div>

      <div>
        <label className="text-[10px] uppercase tracking-wide text-neutral-400">Title</label>
        <input
          type="text"
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={commitTitle}
          className="mt-1 w-full rounded border border-neutral-200 px-2 py-1 text-sm"
          placeholder="Untitled"
        />
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wide text-neutral-400">Google Doc</div>
        {pack.google_doc_url ? (
          <a
            href={pack.google_doc_url}
            target="_blank"
            rel="noreferrer"
            className="mt-1 block text-xs text-[var(--lp-orange)] hover:underline truncate"
          >
            {pack.google_doc_url}
          </a>
        ) : (
          <div className="mt-1 text-xs text-neutral-400">Not yet exported. (R5 wires this up.)</div>
        )}
      </div>

      <div className="pt-4 border-t border-neutral-200">
        <button
          type="button"
          onClick={onPackDelete}
          className="text-xs text-neutral-500 hover:text-red-600"
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
      <div className="p-4 text-xs text-neutral-500">
        No artists in this workspace yet. Create one first.
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-3 p-4">
      <label className="text-xs">
        <div className="text-[10px] uppercase tracking-wide text-neutral-400 mb-1">Artist</div>
        <select
          value={artistId}
          onChange={(e) => setArtistId(e.target.value)}
          className="rounded border border-neutral-200 px-2 py-1 text-sm"
        >
          {artists.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs flex-1 min-w-[200px]">
        <div className="text-[10px] uppercase tracking-wide text-neutral-400 mb-1">
          Title (optional)
        </div>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded border border-neutral-200 px-2 py-1 text-sm"
          placeholder="e.g. Master rider v1"
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

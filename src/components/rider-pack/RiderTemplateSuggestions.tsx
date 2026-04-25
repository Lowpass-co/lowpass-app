'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { createSection } from '@/lib/rider-packs/client';
import {
  RIDER_PACK_TEMPLATES,
  makeUniqueSectionKey,
  type RiderPackTemplate,
} from '@/lib/rider-packs/templates';
import type { ResolvedSection } from '@/lib/rider-packs/types';

type Props = {
  packId: string;
  sections: ResolvedSection[];
  onApplied: () => void | Promise<void>;
};

const STORAGE_KEY = 'lowpass_rider_templates_expanded';

export function RiderTemplateSuggestions({ packId, sections, onApplied }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      const v = window.sessionStorage.getItem(STORAGE_KEY);
      if (v === '1') setOpen(true);
    } catch {
      /* ignore */
    }
  }, []);

  const applyTemplate = async (template: RiderPackTemplate) => {
    if (busyId) return;
    setErr(null);
    setBusyId(template.id);
    const keys = new Set(sections.map((s) => s.section_key));
    let sortBase =
      sections.length > 0 ? Math.max(...sections.map((s) => s.sort_order)) + 10 : 10;
    try {
      for (const sec of template.sections) {
        const sectionKey = makeUniqueSectionKey(sec.section_key, keys);
        keys.add(sectionKey);
        await createSection(packId, {
          section_key: sectionKey,
          title: sec.title,
          sort_order: sortBase,
          fields: sec.fields,
          section_type: 'fields',
        });
        sortBase += 10;
      }
      await onApplied();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not add template');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div
      className="overflow-hidden rounded-xl border"
      style={{ backgroundColor: 'var(--lp-surface)', borderColor: 'var(--lp-border)' }}
    >
      <button
        type="button"
        onClick={() => {
          setOpen((o) => {
            const n = !o;
            try {
              window.sessionStorage.setItem(STORAGE_KEY, n ? '1' : '0');
            } catch {
              /* ignore */
            }
            return n;
          });
        }}
        className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left transition-colors hover:bg-lp-surface-hover"
        style={{ borderColor: 'var(--lp-border)' }}
        aria-expanded={open}
      >
        <div>
          <h2 className="text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary">
            Rider templates
          </h2>
          <p className="mt-0.5 text-xs text-lp-text-secondary">
            {open ? 'Add pre-built section groups to this pack.' : 'Collapsed — expand when you want starter sections.'}
          </p>
        </div>
        {open ? <ChevronDown className="h-4 w-4 shrink-0 text-lp-text-tertiary" /> : <ChevronRight className="h-4 w-4 shrink-0 text-lp-text-tertiary" />}
      </button>
      {open && (
        <>
          <div
            className="border-b px-4 pb-2.5"
            style={{ borderColor: 'var(--lp-border)' }}
          >
            <p className="text-xs text-lp-text-secondary">
              Adds sections and placeholder fields you can rename, remove, or extend.
            </p>
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-3">
            {RIDER_PACK_TEMPLATES.map((t) => (
              <div
                key={t.id}
                className="flex flex-col rounded-lg border border-lp-border bg-lp-bg-secondary p-3"
              >
                <div className="text-sm font-semibold text-lp-text">{t.name}</div>
                <p className="mt-1 flex-1 text-xs leading-relaxed text-lp-text-secondary">
                  {t.description}
                </p>
                <p className="mt-2 text-[10px] text-lp-text-tertiary">
                  {t.sections.length} section{t.sections.length === 1 ? '' : 's'}
                </p>
                <button
                  type="button"
                  disabled={busyId != null}
                  onClick={() => void applyTemplate(t)}
                  className="mt-3 rounded-lg border border-lp-border bg-lp-surface px-3 py-1.5 text-xs font-medium text-lp-text hover:bg-lp-surface-hover disabled:opacity-50"
                >
                  {busyId === t.id ? 'Adding…' : 'Add to pack'}
                </button>
              </div>
            ))}
          </div>
          {err && (
            <div className="border-t border-lp-border px-4 py-2 text-xs text-lp-error" style={{ borderColor: 'var(--lp-border)' }}>
              {err}
            </div>
          )}
        </>
      )}
    </div>
  );
}

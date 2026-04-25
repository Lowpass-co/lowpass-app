'use client';

import { useEffect, useMemo, useState } from 'react';
import { LayoutList } from 'lucide-react';

type Props = {
  open: boolean;
  onClose: () => void;
  onSubmit: (args: { sectionKey: string; title: string }) => void;
};

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function NewSectionDialog({ open, onClose, onSubmit }: Props) {
  const [title, setTitle] = useState('');
  const [sectionKey, setSectionKey] = useState('');
  const [keyEdited, setKeyEdited] = useState(false);
  const [typeSelected, setTypeSelected] = useState(true);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      setTitle('');
      setSectionKey('');
      setKeyEdited(false);
      setTypeSelected(true);
    }
  }, [open]);

  const canSubmit = useMemo(
    () => typeSelected && title.trim().length > 0 && sectionKey.trim().length > 0,
    [typeSelected, title, sectionKey],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="border border-lp-border bg-lp-surface shadow-2xl mx-4 w-full max-w-md rounded-2xl p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-sm font-semibold text-lp-text">New section</h2>
        <p className="mt-1 text-xs text-lp-text-secondary">Choose a layout, then name your section.</p>

        <div className="mt-4 space-y-2">
          <button
            type="button"
            onClick={() => setTypeSelected(true)}
            className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-lp-surface-hover ${
              typeSelected ? 'border-lp-orange' : 'border-lp-border'
            }`}
          >
            <span className="mt-0.5 shrink-0 text-lp-orange">
              <LayoutList className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <span>
              <span className="block text-sm font-medium text-lp-text">Fields & content</span>
              <span className="mt-0.5 block text-xs text-lp-text-secondary">
                Text, tables, contacts, and linked assets.
              </span>
            </span>
          </button>
        </div>

        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSubmit) return;
            onSubmit({ sectionKey: sectionKey.trim(), title: title.trim() });
          }}
        >
          <div>
            <label className="text-[10px] uppercase tracking-widest text-lp-text-tertiary">Title</label>
            <input
              type="text"
              value={title}
              onChange={(event) => {
                const nextTitle = event.target.value;
                setTitle(nextTitle);
                if (!keyEdited) {
                  setSectionKey(slugify(nextTitle));
                }
              }}
              placeholder="e.g. Hospitality"
              className="mt-1 w-full rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text"
            />
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-widest text-lp-text-tertiary">Section key</label>
            <input
              type="text"
              value={sectionKey}
              onChange={(event) => {
                setSectionKey(slugify(event.target.value));
                setKeyEdited(true);
              }}
              placeholder="hospitality"
              className="mt-1 w-full rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-lp-text-secondary transition-colors hover:text-lp-text"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="rounded-lg bg-lp-orange px-4 py-1.5 text-sm font-medium text-white hover:bg-lp-orange/90 disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';

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

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const canSubmit = useMemo(
    () => title.trim().length > 0 && sectionKey.trim().length > 0,
    [title, sectionKey],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl p-5"
        style={{ backgroundColor: 'var(--lp-surface)', border: '1px solid var(--lp-border)' }}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-sm font-semibold text-lp-text">New section</h2>

        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSubmit) return;
            onSubmit({ sectionKey: sectionKey.trim(), title: title.trim() });
          }}
        >
          <div>
            <label className="text-[10px] uppercase tracking-widest text-lp-text-tertiary">
              Title
            </label>
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
              className="mt-1 w-full rounded border px-3 py-2 text-sm"
              style={{
                backgroundColor: 'var(--lp-bg-secondary)',
                borderColor: 'var(--lp-border)',
                color: 'var(--lp-text)',
              }}
            />
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-widest text-lp-text-tertiary">
              Section key
            </label>
            <input
              type="text"
              value={sectionKey}
              onChange={(event) => {
                setSectionKey(slugify(event.target.value));
                setKeyEdited(true);
              }}
              placeholder="hospitality"
              className="mt-1 w-full rounded border px-3 py-2 text-sm"
              style={{
                backgroundColor: 'var(--lp-bg-secondary)',
                borderColor: 'var(--lp-border)',
                color: 'var(--lp-text)',
              }}
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-lp-border px-3 py-1.5 text-xs"
              style={{ color: 'var(--lp-text-secondary)' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="rounded bg-[var(--lp-orange)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              Create section
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

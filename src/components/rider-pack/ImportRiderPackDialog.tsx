'use client';

import { useCallback, useState } from 'react';
import { X, Download } from 'lucide-react';
import { BrandedSelect, type BrandedSelectOption } from '@/components/ui/BrandedSelect';

type ArtistOpt = { id: string; name: string };
export function ImportRiderPackDialog({
  open,
  onOpenChange,
  targetArtist,
  otherArtists,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  targetArtist: ArtistOpt;
  /** Artists other than the current (source band list). */
  otherArtists: ArtistOpt[];
}) {
  const [sourceArtistId, setSourceArtistId] = useState('');
  const [packOptions, setPackOptions] = useState<BrandedSelectOption[]>([]);
  const [sourcePackId, setSourcePackId] = useState('');
  const [title, setTitle] = useState('');
  const [loadingPacks, setLoadingPacks] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPacks = useCallback(async (artistId: string) => {
    if (!artistId) {
      setPackOptions([]);
      setSourcePackId('');
      return;
    }
    setLoadingPacks(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/rider-packs?scope=artist&artist_id=${encodeURIComponent(artistId)}`,
      );
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof j.error === 'string' ? j.error : 'Failed to load packs');
        setPackOptions([]);
        return;
      }
      const list = (j.packs ?? []) as { id: string; title: string | null }[];
      setPackOptions(
        list.map((p) => ({
          value: p.id,
          label: p.title?.trim() ? p.title : '(Untitled)',
        })),
      );
      setSourcePackId(list[0]?.id ?? '');
    } finally {
      setLoadingPacks(false);
    }
  }, []);

  const onPickSourceBand = (id: string) => {
    setSourceArtistId(id);
    setSourcePackId('');
    void loadPacks(id);
  };

  const runImport = async () => {
    if (!sourcePackId || !targetArtist.id) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/rider-packs/clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_pack_id: sourcePackId,
          target_artist_id: targetArtist.id,
          title: title.trim() || null,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof j.error === 'string' ? j.error : 'Import failed');
        return;
      }
      const id = (j.pack as { id?: string })?.id;
      onOpenChange(false);
      if (id) {
        window.location.href = `/rider-packs/${id}`;
        return;
      }
      window.location.reload();
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const bandOptions: BrandedSelectOption[] = otherArtists.map((a) => ({
    value: a.id,
    label: a.name,
  }));

  return (
    <div className="lp-dropdown-layer fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        className="relative w-full max-w-md rounded-xl border p-4 shadow-lg"
        style={{ backgroundColor: 'var(--lp-surface)', borderColor: 'var(--lp-border)' }}
      >
        <button
          type="button"
          aria-label="Close"
          className="absolute right-3 top-3 rounded p-1 text-lp-text-tertiary hover:bg-lp-surface-hover hover:text-lp-text"
          onClick={() => onOpenChange(false)}
        >
          <X className="h-4 w-4" />
        </button>
        <div className="mb-1 flex items-center gap-2 pr-8">
          <Download className="h-4 w-4 text-[var(--lp-orange)]" />
          <h2 className="text-base font-semibold text-lp-text">Import a rider from another band</h2>
        </div>
        <p className="mb-4 text-xs text-lp-text-secondary">
          Copies the selected band&apos;s <span className="text-lp-text">artist</span> rider into{' '}
          <span className="font-medium text-lp-text">{targetArtist.name}</span>. Your list below stays
          filtered to this band until you import.
        </p>

        {error && (
          <div
            className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200"
            role="alert"
          >
            {error}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary">
              Source band
            </div>
            <BrandedSelect
              value={sourceArtistId}
              onChange={onPickSourceBand}
              options={bandOptions}
              placeholder="Choose band…"
              ariaLabel="Source band"
              className="w-full"
              minWidth={0}
            />
            {otherArtists.length === 0 && (
              <p className="mt-1 text-xs text-lp-text-tertiary">No other bands in this workspace.</p>
            )}
          </div>

          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary">
              Rider to copy
            </div>
            <BrandedSelect
              value={sourcePackId}
              onChange={setSourcePackId}
              options={packOptions}
              placeholder={loadingPacks ? 'Loading…' : 'Pick a rider…'}
              disabled={!sourceArtistId || loadingPacks}
              ariaLabel="Source rider"
              className="w-full"
              minWidth={0}
            />
          </div>

          <label className="block text-xs">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary">
              New title (optional)
            </div>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full max-w-sm rounded-lg border border-lp-border bg-lp-bg px-3 py-2 text-sm text-lp-text"
              placeholder="Default: from source + “(imported)”"
            />
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg px-3 py-1.5 text-sm text-lp-text-secondary hover:bg-lp-surface-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void runImport()}
            disabled={submitting || !sourcePackId}
            className="rounded-lg bg-[var(--lp-orange)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Importing…' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
}

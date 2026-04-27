'use client';

/* ============================================
   LOWPASS — Asset Picker (R3b)

   Used inside the rider/pack editor's Asset field.
   - Lists existing assets for the pack's artist (all scopes).
   - Shows thumbnails for images via /api/rider-assets signedUrls.
   - Uploads NEW assets direct to the `rider-assets` bucket using
     @/lib/supabase-client, then POSTs metadata via /api/rider-assets.

   Path convention (enforced server-side by isValidStoragePathForWorkspace):
     {workspace_id}/{artist_id}/{uuid}-{filename}
   ============================================ */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase-client';
import { listAssets, type RiderAsset } from '@/lib/rider-packs/client';
import type { PackScope } from '@/lib/rider-packs/types';

export type PackContext = {
  workspaceId: string;
  artistId: string;
  scope: PackScope;
  tourId: string | null;
  routingId: string | null;
};

type Props = {
  /** Currently selected asset id (from FieldAsset.asset_id). Empty string = none. */
  value: string;
  onChange: (assetId: string) => void;
  packContext: PackContext;
};

const RIDER_ASSETS_BUCKET = 'rider-assets';

export function AssetPicker({ value, onChange, packContext }: Props) {
  const [assets, setAssets] = useState<RiderAsset[]>([]);
  const [signedUrls, setSignedUrls] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listAssets({ artistId: packContext.artistId });
      setAssets(res.assets);
      setSignedUrls(res.signedUrls);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load assets');
    } finally {
      setLoading(false);
    }
  }, [packContext.artistId]);

  useEffect(() => {
    if (!expanded) return;
    void refresh();
  }, [expanded, refresh]);

  const selected = useMemo(
    () => assets.find((a) => a.id === value) ?? null,
    [assets, value],
  );

  return (
    <div className="space-y-2">
      {/* Current selection summary */}
      {value ? (
        <SelectedAssetCard
          assetId={value}
          asset={selected}
          signedUrl={selected ? signedUrls[selected.id] ?? null : null}
          onClear={() => onChange('')}
          onChange={() => setExpanded(true)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="w-full rounded-md border border-dashed border-lp-border px-3 py-2 text-sm text-lp-text-secondary hover:bg-lp-surface-hover"
        >
          Choose or upload an asset
        </button>
      )}

      {expanded && (
        <div className="space-y-3 rounded-md border border-lp-border bg-lp-surface p-3">
          <UploadForm
            packContext={packContext}
            onUploaded={async (newAssetId) => {
              await refresh();
              onChange(newAssetId);
              setExpanded(false);
            }}
          />

          <div className="border-t border-lp-border pt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium uppercase text-lp-text-secondary">
                Existing assets
              </span>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="text-xs text-lp-text-secondary hover:text-lp-text"
              >
                Close
              </button>
            </div>

            {loading && <div className="text-xs text-lp-text-secondary">Loading…</div>}
            {error && <div className="text-xs text-lp-error">{error}</div>}
            {!loading && !error && assets.length === 0 && (
              <div className="text-xs text-lp-text-secondary">
                No assets for this artist yet. Upload one above.
              </div>
            )}

            {assets.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {assets.map((a) => (
                  <AssetTile
                    key={a.id}
                    asset={a}
                    signedUrl={signedUrls[a.id] ?? null}
                    selected={a.id === value}
                    onSelect={() => {
                      onChange(a.id);
                      setExpanded(false);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Subcomponents ----------

function SelectedAssetCard({
  assetId,
  asset,
  signedUrl,
  onClear,
  onChange,
}: {
  assetId: string;
  asset: RiderAsset | null;
  signedUrl: string | null;
  onClear: () => void;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-lp-border bg-lp-bg-secondary p-2">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded border border-lp-border bg-lp-surface">
        {asset?.asset_type === 'image' && signedUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={signedUrl} alt={asset.label} className="h-full w-full object-cover" />
        ) : (
          <span className="text-[10px] uppercase text-lp-text-tertiary">file</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">
          {asset?.label ?? '(asset not visible in this scope)'}
        </div>
        <div className="truncate font-mono text-[10px] text-lp-text-secondary">{assetId}</div>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onChange}
          className="rounded border border-lp-border px-2 py-1 text-xs hover:bg-lp-surface-hover"
        >
          Change
        </button>
        <button
          type="button"
          onClick={onClear}
          className="px-1 text-xs text-lp-text-tertiary hover:text-lp-error"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

function AssetTile({
  asset,
  signedUrl,
  selected,
  onSelect,
}: {
  asset: RiderAsset;
  signedUrl: string | null;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`overflow-hidden rounded border bg-lp-surface text-left transition hover:shadow-sm ${
        selected
          ? 'border-[var(--lp-orange)] ring-1 ring-[var(--lp-orange)]'
          : 'border-lp-border'
      }`}
    >
      <div className="flex h-20 w-full items-center justify-center overflow-hidden bg-lp-bg-secondary">
        {asset.asset_type === 'image' && signedUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={signedUrl} alt={asset.label} className="h-full w-full object-cover" />
        ) : (
          <span className="text-[10px] uppercase text-lp-text-tertiary">{asset.asset_type}</span>
        )}
      </div>
      <div className="px-2 py-1.5">
        <div className="text-xs font-medium truncate">{asset.label}</div>
        <div className="text-[10px] uppercase tracking-wide text-lp-text-tertiary">
          {asset.scope}
        </div>
      </div>
    </button>
  );
}

function UploadForm({
  packContext,
  onUploaded,
}: {
  packContext: PackContext;
  onUploaded: (newAssetId: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState('');
  const [promoteToArtist, setPromoteToArtist] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canPromote = packContext.scope !== 'artist';

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      // Asset scope: default to the pack's scope; if user promoted, force artist.
      const assetScope: PackScope = promoteToArtist ? 'artist' : packContext.scope;
      const assetTourId = assetScope === 'artist' ? null : packContext.tourId;
      const assetRoutingId = assetScope === 'show' ? packContext.routingId : null;

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const uuid = crypto.randomUUID();
      const storagePath = `${packContext.workspaceId}/${packContext.artistId}/${uuid}-${safeName}`;

      // 1) Direct-to-bucket upload
      const supabase = createClient();
      const { error: uploadErr } = await supabase.storage
        .from(RIDER_ASSETS_BUCKET)
        .upload(storagePath, file, {
          contentType: file.type || undefined,
          upsert: false,
        });
      if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

      // 2) Metadata row
      const assetType: 'image' | 'file' = file.type.startsWith('image/') ? 'image' : 'file';
      const finalLabel = label.trim() || file.name;

      const res = await fetch('/api/rider-assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: assetScope,
          artist_id: packContext.artistId,
          tour_id: assetTourId,
          routing_id: assetRoutingId,
          asset_type: assetType,
          label: finalLabel,
          storage_path: storagePath,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? 'Failed to register asset');
      }
      const inserted = await res.json();

      setFile(null);
      setLabel('');
      setPromoteToArtist(false);
      onUploaded(inserted.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium uppercase text-lp-text-secondary">Upload new</div>
      <input
        type="file"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="block w-full text-xs text-lp-text file:mr-3 file:rounded file:border-0 file:bg-lp-bg-secondary file:px-3 file:py-1 file:text-xs hover:file:bg-lp-surface-hover"
      />
      <input
        type="text"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Label (defaults to filename)"
        className="w-full rounded-md border border-lp-border px-3 py-2 text-sm"
      />
      {canPromote && (
        <label className="flex items-center gap-2 text-xs text-lp-text-secondary">
          <input
            type="checkbox"
            checked={promoteToArtist}
            onChange={(e) => setPromoteToArtist(e.target.checked)}
          />
          Make available to all tours for this artist
        </label>
      )}
      {err && <div className="text-xs text-lp-error">{err}</div>}
      <button
        type="button"
        onClick={submit}
        disabled={!file || busy}
        className="rounded bg-[var(--lp-orange)] px-3 py-1.5 text-xs text-white hover:opacity-90 disabled:opacity-50"
      >
        {busy ? 'Uploading…' : 'Upload'}
      </button>
    </div>
  );
}

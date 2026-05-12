'use client';

/* ============================================
   LOWPASS — <CoverPagePanel> (Sprint 12 §9b)

   Editor-side cover-page editor. Mounted in PackEditor as the
   first selection in the section list (above real sections).
   Fields:
     - Logo: upload (rider-assets storage) or "Use artist
       default". Preview thumbnail shows the resolved logo
       (rider override → artist default → empty).
     - Title:       rider_packs.title (existing column)
     - Subtitle:    rider_packs.cover_subtitle
     - Disclaimer:  rider_packs.cover_disclaimer

   All fields auto-save on blur via the parent's existing
   debounced-save helper (passed in as a single `onPatch`
   prop the wrapper hooks up). The pattern matches the rest
   of the editor — the cover page is just another PATCH
   target for rider_packs.

   Logo upload flow:
     1. User picks a file.
     2. Client uploads to rider-assets bucket at the path
        `cover-logos/<pack_id>/<timestamp>-<random>.<ext>`.
        Bucket RLS already allows any authenticated workspace
        member to insert (migration 034).
     3. On success, PATCH the storage path into
        rider_packs.cover_logo_url so the public-reader
        endpoint can sign it at render time.
   ============================================ */

import { useEffect, useRef, useState } from 'react';
import { ImageIcon, Loader2, Trash2, X } from 'lucide-react';
import { createClient } from '@/lib/supabase-client';
import { SaveStatePill, type SavePillState } from '@/components/rider-pack/SaveStatePill';
import type { RiderPack } from '@/lib/rider-packs/types';

interface CoverPagePanelProps {
  pack: RiderPack;
  savePill: { state: SavePillState; error: string | null };
  /** Patch handler that merges into the editor's debounced
   *  save chain. Schema-typed to the same Pick<> the
   *  updatePack lib accepts. */
  onPatch: (
    body: Partial<
      Pick<
        RiderPack,
        | 'title'
        | 'cover_logo_url'
        | 'cover_subtitle'
        | 'cover_disclaimer'
      >
    >,
  ) => void;
}

export function CoverPagePanel({
  pack,
  savePill,
  onPatch,
}: CoverPagePanelProps) {
  const [artistName, setArtistName] = useState<string>('Artist');
  const [title, setTitle] = useState(pack.title ?? '');
  const [subtitle, setSubtitle] = useState(pack.cover_subtitle ?? '');
  const [disclaimer, setDisclaimer] = useState(pack.cover_disclaimer ?? '');
  const [resolvedLogoUrl, setResolvedLogoUrl] = useState<string | null>(null);
  const [artistDefaultLogoUrl, setArtistDefaultLogoUrl] = useState<string | null>(null);

  /* Fetch + sign the artist's default_logo_url for the
     fallback preview. Runs once per artist_id change. */
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    void (async () => {
      try {
        const { data } = await supabase
          .from('artists')
          .select('name, default_logo_url')
          .eq('id', pack.artist_id)
          .maybeSingle<{ name: string; default_logo_url: string | null }>();
        if (cancelled) return;
        if (data?.name) setArtistName(data.name);
        const raw = data?.default_logo_url ?? null;
        if (!raw) {
          setArtistDefaultLogoUrl(null);
          return;
        }
        if (/^https?:\/\//i.test(raw)) {
          setArtistDefaultLogoUrl(raw);
          return;
        }
        const { data: signed } = await supabase.storage
          .from('rider-assets')
          .createSignedUrl(raw, 60 * 60);
        if (cancelled) return;
        setArtistDefaultLogoUrl(signed?.signedUrl ?? null);
      } catch {
        if (!cancelled) setArtistDefaultLogoUrl(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pack.artist_id]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* Sync local drafts when the server pack identity changes. */
  useEffect(() => {
    setTitle(pack.title ?? '');
  }, [pack.id, pack.title]);
  useEffect(() => {
    setSubtitle(pack.cover_subtitle ?? '');
  }, [pack.id, pack.cover_subtitle]);
  useEffect(() => {
    setDisclaimer(pack.cover_disclaimer ?? '');
  }, [pack.id, pack.cover_disclaimer]);

  /* Sign the current cover_logo_url (a storage path) so the
     panel can preview it. External URLs (http(s)://) pass
     through. Re-runs when the pack's cover_logo_url changes. */
  useEffect(() => {
    let cancelled = false;
    const raw = pack.cover_logo_url;
    if (!raw) {
      setResolvedLogoUrl(null);
      return;
    }
    if (/^https?:\/\//i.test(raw)) {
      setResolvedLogoUrl(raw);
      return;
    }
    const supabase = createClient();
    void supabase.storage
      .from('rider-assets')
      .createSignedUrl(raw, 60 * 60)
      .then(({ data }) => {
        if (cancelled) return;
        setResolvedLogoUrl(data?.signedUrl ?? null);
      })
      .catch(() => {
        if (!cancelled) setResolvedLogoUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [pack.cover_logo_url]);

  const previewUrl = resolvedLogoUrl ?? artistDefaultLogoUrl;
  const usingDefault = !pack.cover_logo_url && !!artistDefaultLogoUrl;

  async function handleUpload(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const supabase = createClient();
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png';
      const path = `cover-logos/${pack.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('rider-assets')
        .upload(path, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type || undefined,
        });
      if (upErr) {
        setUploadError(upErr.message);
        return;
      }
      onPatch({ cover_logo_url: path });
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  function handleUseDefault() {
    onPatch({ cover_logo_url: null });
  }

  return (
    <div
      className="mx-auto max-w-3xl overflow-hidden rounded-xl border"
      style={{ backgroundColor: 'var(--lp-surface)', borderColor: 'var(--lp-border)' }}
    >
      <div
        className="flex items-center justify-between gap-2 border-b px-4 py-3"
        style={{ borderColor: 'var(--lp-border)' }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="text-sm font-semibold text-lp-text">Cover page</span>
          <SaveStatePill state={savePill.state} error={savePill.error} />
        </div>
        <span
          className="text-[10px] uppercase tracking-widest"
          style={{ color: 'var(--lp-text-tertiary)' }}
        >
          {artistName}
        </span>
      </div>

      <div
        className="flex flex-col"
        style={{ gap: 'var(--lp-space-4)', padding: 'var(--lp-space-4)' }}
      >
        {/* Logo */}
        <div>
          <span
            className="lp-label-caps"
            style={{
              display: 'block',
              marginBottom: 'var(--lp-space-2)',
              fontSize: 'var(--lp-text-xs)',
              fontWeight: 'var(--lp-weight-semibold)',
              color: 'var(--lp-text)',
            }}
          >
            Logo
          </span>
          <div
            className="flex items-start"
            style={{ gap: 'var(--lp-space-3)' }}
          >
            <div
              style={{
                width: 120,
                height: 80,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--lp-bg)',
                border: '1px solid var(--lp-border)',
                borderRadius: 'var(--lp-radius-md)',
                overflow: 'hidden',
              }}
            >
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt={`${artistName} logo`}
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              ) : (
                <ImageIcon
                  size={20}
                  style={{ color: 'var(--lp-text-tertiary)' }}
                />
              )}
            </div>
            <div
              className="flex flex-col"
              style={{ gap: 'var(--lp-space-1)' }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void handleUpload(f);
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="btn-transition inline-flex items-center"
                style={{
                  gap: 6,
                  padding: 'var(--lp-space-1) var(--lp-space-3)',
                  fontSize: 'var(--lp-text-xs)',
                  fontWeight: 'var(--lp-weight-semibold)',
                  color: 'var(--lp-text-secondary)',
                  background: 'transparent',
                  border: '1px solid var(--lp-border-strong)',
                  borderRadius: 'var(--lp-radius-md)',
                  cursor: uploading ? 'not-allowed' : 'pointer',
                }}
              >
                {uploading ? <Loader2 size={12} className="animate-spin" /> : null}
                Upload new
              </button>
              {pack.cover_logo_url ? (
                <button
                  type="button"
                  onClick={handleUseDefault}
                  className="btn-transition inline-flex items-center"
                  style={{
                    gap: 6,
                    padding: 'var(--lp-space-1) var(--lp-space-3)',
                    fontSize: 'var(--lp-text-xs)',
                    color: 'var(--lp-text-tertiary)',
                    background: 'transparent',
                    border: '1px solid var(--lp-border)',
                    borderRadius: 'var(--lp-radius-md)',
                    cursor: 'pointer',
                  }}
                  title="Clear the rider override; falls back to the artist's default logo."
                >
                  <Trash2 size={12} /> Use artist default
                </button>
              ) : null}
              {usingDefault ? (
                <span
                  className="text-[10px]"
                  style={{ color: 'var(--lp-text-tertiary)', fontStyle: 'italic' }}
                >
                  Using artist default. Upload one above to override on this rider only.
                </span>
              ) : null}
              {!previewUrl ? (
                <span
                  className="text-[10px]"
                  style={{ color: 'var(--lp-text-tertiary)', fontStyle: 'italic' }}
                >
                  No logo set — cover renders without one.
                </span>
              ) : null}
              {uploadError ? (
                <span
                  className="inline-flex items-center text-[10px]"
                  style={{ gap: 4, color: 'var(--color-lp-error)' }}
                >
                  <X size={10} /> {uploadError}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Title */}
        <CoverField
          label="Title"
          value={title}
          onChange={setTitle}
          onBlur={() => {
            if (title !== (pack.title ?? '')) onPatch({ title: title.trim() || null });
          }}
          placeholder="Technical & Production Rider"
        />

        {/* Subtitle */}
        <CoverField
          label="Subtitle"
          value={subtitle}
          onChange={setSubtitle}
          onBlur={() => {
            if (subtitle !== (pack.cover_subtitle ?? '')) {
              onPatch({ cover_subtitle: subtitle.trim() || null });
            }
          }}
          placeholder="Global Festivals — Summer '26"
        />

        {/* Disclaimer */}
        <div>
          <label
            htmlFor="lp-cover-disclaimer"
            className="lp-label-caps"
            style={{
              display: 'block',
              marginBottom: 'var(--lp-space-1)',
              fontSize: 'var(--lp-text-xs)',
              fontWeight: 'var(--lp-weight-semibold)',
              color: 'var(--lp-text)',
            }}
          >
            Disclaimer
          </label>
          <textarea
            id="lp-cover-disclaimer"
            value={disclaimer}
            onChange={(e) => setDisclaimer(e.target.value)}
            onBlur={() => {
              if (disclaimer !== (pack.cover_disclaimer ?? '')) {
                onPatch({ cover_disclaimer: disclaimer.trim() || null });
              }
            }}
            rows={3}
            placeholder="This rider is for reference only. Please confirm details directly with the tour manager."
            style={{
              width: '100%',
              padding: 'var(--lp-space-2) var(--lp-space-3)',
              fontSize: 'var(--lp-text-sm)',
              color: 'var(--lp-text)',
              background: 'var(--lp-bg)',
              border: '1px solid var(--lp-border-strong)',
              borderRadius: 'var(--lp-radius-md)',
              outline: 'none',
              resize: 'vertical',
              fontFamily: 'inherit',
            }}
          />
        </div>
      </div>
    </div>
  );
}

interface CoverFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  placeholder?: string;
}

function CoverField({ label, value, onChange, onBlur, placeholder }: CoverFieldProps) {
  return (
    <div>
      <label
        className="lp-label-caps"
        style={{
          display: 'block',
          marginBottom: 'var(--lp-space-1)',
          fontSize: 'var(--lp-text-xs)',
          fontWeight: 'var(--lp-weight-semibold)',
          color: 'var(--lp-text)',
        }}
      >
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: 'var(--lp-space-2) var(--lp-space-3)',
          fontSize: 'var(--lp-text-sm)',
          color: 'var(--lp-text)',
          background: 'var(--lp-bg)',
          border: '1px solid var(--lp-border-strong)',
          borderRadius: 'var(--lp-radius-md)',
          outline: 'none',
        }}
      />
    </div>
  );
}

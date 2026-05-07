/* ============================================
   LOWPASS — Sprint 8.4 §1 — <ArtistImageUploader>

   Reusable drag-drop / click upload for an artist's logo
   (~120×120) or banner (~full-width 240px). Posts to
   /api/artists/[id]/image/[kind] which uploads to the
   artist-assets bucket and writes the URL to
   artists.branding JSONB.

   Component owns its own loading / error state. Parent passes
   the current URL (for preview) and an onChange callback that
   fires after every successful upload or remove. Server is the
   source of truth — onChange is informational so the parent can
   refresh local state without re-fetching.

   Decisions per Sprint 8.4 §1 sign-off:
     - Allowed types: image/jpeg, image/png, image/webp.
     - Max 5MB.
     - Stable storage path → re-uploads overwrite.
     - No image cropping/processing.
     - Removal does NOT prompt for confirmation (low-stakes;
       user can re-upload).
   ============================================ */

'use client';

import { useCallback, useId, useRef, useState } from 'react';
import { Upload, X as XIcon } from 'lucide-react';

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

export interface ArtistImageUploaderProps {
  artistId: string;
  kind: 'logo' | 'banner';
  currentUrl: string | null;
  onChange: (newUrl: string | null) => void;
  /** Disables interaction while a parent form is submitting. */
  disabled?: boolean;
}

export function ArtistImageUploader({
  artistId,
  kind,
  currentUrl,
  onChange,
  disabled = false,
}: ArtistImageUploaderProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const isBanner = kind === 'banner';
  // Sprint 8.4 §1 — logo is square 120×120; banner is full width
  // at 240px tall. Both expand to the parent container's width.
  const zoneStyle: React.CSSProperties = isBanner
    ? { width: '100%', aspectRatio: '4 / 1', minHeight: 160 }
    : { width: 120, height: 120 };

  const validate = (file: File): string | null => {
    if (!ALLOWED_MIME.includes(file.type)) {
      return 'Only JPEG, PNG, or WebP images are allowed.';
    }
    if (file.size > MAX_BYTES) {
      return `File too large (max ${MAX_BYTES / 1024 / 1024}MB).`;
    }
    return null;
  };

  const upload = useCallback(
    async (file: File) => {
      const validationErr = validate(file);
      if (validationErr) {
        setError(validationErr);
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch(`/api/artists/${artistId}/image/${kind}`, {
          method: 'POST',
          body: fd,
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as
            | { error?: string }
            | null;
          setError(body?.error ?? `Upload failed (${res.status}).`);
          return;
        }
        const { url } = (await res.json()) as { url: string };
        onChange(url);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Network error');
      } finally {
        setBusy(false);
      }
    },
    [artistId, kind, onChange],
  );

  const remove = useCallback(async () => {
    if (!currentUrl) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/artists/${artistId}/image/${kind}`, {
        method: 'DELETE',
      });
      if (!res.ok && res.status !== 204) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(body?.error ?? `Remove failed (${res.status}).`);
        return;
      }
      onChange(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setBusy(false);
    }
  }, [artistId, kind, currentUrl, onChange]);

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled || busy) return;
    const file = e.dataTransfer.files?.[0];
    if (file) void upload(file);
  };

  const onZoneClick = () => {
    if (disabled || busy) return;
    inputRef.current?.click();
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--lp-space-2)',
        width: isBanner ? '100%' : 'auto',
        alignItems: isBanner ? 'stretch' : 'flex-start',
      }}
    >
      {/* Drop zone */}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={`Upload ${kind} image`}
        aria-disabled={disabled || busy}
        onClick={onZoneClick}
        onKeyDown={(e) => {
          if (disabled || busy) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled && !busy) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className="btn-transition"
        style={{
          ...zoneStyle,
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: currentUrl
            ? 'var(--lp-bg-deep)'
            : 'var(--lp-panel)',
          border: currentUrl
            ? '1px solid var(--lp-border-strong)'
            : `1px ${dragOver ? 'solid' : 'dashed'} ${
                dragOver
                  ? 'var(--color-lp-orange)'
                  : 'var(--lp-border-strong)'
              }`,
          borderRadius: 'var(--lp-radius-md)',
          cursor: disabled || busy ? 'wait' : 'pointer',
          opacity: disabled ? 0.55 : 1,
        }}
      >
        {currentUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={currentUrl}
            alt={`Artist ${kind}`}
            style={{
              width: '100%',
              height: '100%',
              objectFit: isBanner ? 'cover' : 'contain',
              display: 'block',
            }}
          />
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 'var(--lp-space-2)',
              padding: 'var(--lp-space-3)',
              color: 'var(--lp-text-tertiary)',
              textAlign: 'center',
            }}
          >
            <Upload size={isBanner ? 20 : 16} strokeWidth={2} aria-hidden />
            <span
              className="lp-label-caps"
              style={{ color: 'var(--lp-text-tertiary)' }}
            >
              {dragOver ? 'Drop to upload' : 'Drop or click'}
            </span>
            {isBanner ? (
              <span
                style={{
                  fontSize: 'var(--lp-text-2xs)',
                  color: 'var(--lp-text-tertiary)',
                }}
              >
                JPEG, PNG, or WebP · 5MB max
              </span>
            ) : null}
          </div>
        )}

        {/* Busy overlay */}
        {busy ? (
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'color-mix(in srgb, var(--lp-bg) 70%, transparent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 'var(--lp-text-xs)',
              color: 'var(--lp-text-secondary)',
              fontWeight: 'var(--lp-weight-medium)',
            }}
          >
            Uploading…
          </div>
        ) : null}
      </div>

      {/* Action row */}
      {currentUrl ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--lp-space-2)',
          }}
        >
          <button
            type="button"
            onClick={onZoneClick}
            disabled={disabled || busy}
            className="btn-transition"
            style={actionButtonStyle(disabled || busy)}
          >
            Replace
          </button>
          <button
            type="button"
            onClick={() => void remove()}
            disabled={disabled || busy}
            aria-label={`Remove ${kind}`}
            className="btn-transition inline-flex items-center"
            style={{
              ...actionButtonStyle(disabled || busy),
              gap: 'var(--lp-space-1)',
            }}
          >
            <XIcon size={12} strokeWidth={2} aria-hidden />
            Remove
          </button>
        </div>
      ) : null}

      {/* Hidden input */}
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={ALLOWED_MIME.join(',')}
        style={{ display: 'none' }}
        disabled={disabled || busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          // Reset so re-uploading the same filename fires onChange.
          e.target.value = '';
        }}
      />

      {/* Error inline */}
      {error ? (
        <div
          role="alert"
          style={{
            fontSize: 'var(--lp-text-xs)',
            color: 'var(--color-lp-error)',
          }}
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}

function actionButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: 'var(--lp-space-1) var(--lp-space-2)',
    fontSize: 'var(--lp-text-xs)',
    fontWeight: 'var(--lp-weight-medium)',
    color: 'var(--lp-text-secondary)',
    background: 'transparent',
    border: '1px solid var(--lp-border-strong)',
    borderRadius: 'var(--lp-radius-sm)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
  };
}

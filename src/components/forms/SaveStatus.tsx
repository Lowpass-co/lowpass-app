'use client';

/* ============================================
   LOWPASS — <SaveStatus> (Sprint 10 §3.1)

   Tiny pill that shows the save state next to a slide-over's
   footer Cancel/Save buttons.

     - 'saving' : amber dot + "Saving…"
     - 'saved'  : green dot + "Saved 12s ago" (relative)
     - 'error'  : red dot + "Save failed — Retry?" (Retry calls
                  the onRetry prop)
     - 'idle'   : nothing — the pill is invisible until the
                  first edit fires a save

   Updates "Saved Xs ago" once per second while the slide-over
   stays open. The timer cleans up on unmount.
   ============================================ */

import { useEffect, useState } from 'react';
import type { SaveStatus as SaveStatusKind } from '@/lib/forms/useAutoSave';

interface SaveStatusProps {
  status: SaveStatusKind;
  lastSavedAt: Date | null;
  errorMessage: string | null;
  onRetry?: () => void;
}

function formatRelative(at: Date, now: number): string {
  const seconds = Math.max(0, Math.floor((now - at.getTime()) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export function SaveStatus({
  status,
  lastSavedAt,
  errorMessage,
  onRetry,
}: SaveStatusProps) {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (status !== 'saved' || !lastSavedAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [status, lastSavedAt]);

  if (status === 'idle') return null;

  if (status === 'saving') {
    return (
      <Pill color="var(--color-lp-warning, #c97a1d)" label="Saving…" />
    );
  }
  if (status === 'saved') {
    const label = lastSavedAt ? `Saved ${formatRelative(lastSavedAt, now)}` : 'Saved';
    return <Pill color="var(--color-lp-success, #1f8a4c)" label={label} />;
  }
  // error
  return (
    <Pill
      color="var(--color-lp-error)"
      label={errorMessage ?? 'Save failed'}
      action={onRetry ? { label: 'Retry?', onClick: onRetry } : undefined}
    />
  );
}

function Pill({
  color,
  label,
  action,
}: {
  color: string;
  label: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <span
      role="status"
      aria-live="polite"
      className="inline-flex items-center"
      style={{
        gap: 6,
        padding: '2px 8px',
        fontSize: 'var(--lp-text-xs)',
        fontWeight: 'var(--lp-weight-medium)',
        color,
        background: `color-mix(in srgb, ${color} 10%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`,
        borderRadius: 999,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: color,
        }}
      />
      <span className="truncate" style={{ maxWidth: 240 }}>
        {label}
      </span>
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          style={{
            marginLeft: 4,
            padding: '0 6px',
            fontSize: 'var(--lp-text-2xs)',
            fontWeight: 'var(--lp-weight-semibold)',
            color,
            background: 'transparent',
            border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`,
            borderRadius: 999,
            cursor: 'pointer',
          }}
        >
          {action.label}
        </button>
      ) : null}
    </span>
  );
}

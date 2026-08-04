'use client';

/* The banner for getLandingSuggestion. Offers; never acts on its own. */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';

export function EmptyWorkspacePrompt({
  currentName,
  targetId,
  targetName,
}: {
  currentName: string;
  targetId: string;
  targetName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div
      role="status"
      className="mx-4 mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-3 py-2"
      style={{
        borderColor: 'var(--lp-border-strong)',
        background: 'color-mix(in srgb, var(--lp-orange) 8%, transparent)',
        fontSize: 'var(--lp-text-sm)',
        color: 'var(--lp-text)',
      }}
    >
      <span>
        You are in <strong>{currentName}</strong>, which is empty. You are also a member of{' '}
        <strong>{targetName}</strong>.
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const res = await fetch('/api/workspaces/switch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workspace_id: targetId }),
          });
          if (!res.ok) { setBusy(false); return; }
          router.refresh();
        }}
        className="btn-transition ml-auto inline-flex items-center gap-1 rounded px-2 py-0.5"
        style={{ color: 'var(--lp-orange)', fontWeight: 'var(--lp-weight-medium)' }}
      >
        {busy ? 'Switching…' : `Switch to ${targetName}`}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </button>
      {/* Dismiss is per-render, not persisted. Persisting it is the same new
          state the one-time redirect would have needed; a banner you can wave
          away for the session is enough, and it reappears rather than silently
          deciding you meant to stay. */}
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="btn-transition rounded px-2 py-0.5"
        style={{ color: 'var(--lp-text-tertiary)' }}
      >
        Stay here
      </button>
    </div>
  );
}

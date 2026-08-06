'use client';

/* ============================================
   LOWPASS — <RiderPackDeleteButton> (Adam's walk, 2026-08-06)

   "you can't delete riders" — the lists could (grid card + tour list),
   the EDITOR couldn't, and the editor is where you decide a rider is
   dead. One confirmed, destructive action: deletePack → navigate back
   to the list this pack belongs to (tour riders or the artist library).
   ============================================ */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, Loader2 } from 'lucide-react';
import { deletePack } from '@/lib/rider-packs/client';
import { useToast } from '@/components/ui/Toast';

export function RiderPackDeleteButton({
  packId,
  packTitle,
  backHref,
}: {
  packId: string;
  packTitle: string;
  /** Where deletion lands you: the tour riders list or the artist library. */
  backHref: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);

  const onDelete = async () => {
    if (!window.confirm(`Delete "${packTitle}"? Sections, channel rows and attachments go with it. This can't be undone.`)) {
      return;
    }
    setBusy(true);
    try {
      await deletePack(packId);
      showToast('Rider deleted', 'success');
      router.push(backHref);
      router.refresh();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Delete failed', 'error');
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void onDelete()}
      disabled={busy}
      title="Delete this rider"
      className="btn-transition inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-lp-orange)]"
      style={{
        borderColor: 'var(--lp-border-strong)',
        background: 'var(--lp-bg)',
        color: 'var(--lp-error, #f85149)',
        fontSize: '13px',
        fontWeight: 500,
        opacity: busy ? 0.6 : 1,
      }}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
      Delete
    </button>
  );
}

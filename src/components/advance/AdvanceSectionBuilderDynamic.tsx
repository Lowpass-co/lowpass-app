'use client';

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

const AdvanceSectionBuilder = dynamic(
  () =>
    import(
      '@/components/advance/AdvanceSectionBuilder'
    ).then((m) => ({ default: m.AdvanceSectionBuilder })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center gap-2 p-8 text-sm text-lp-text-secondary">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading editor…
      </div>
    ),
  }
);

export function AdvanceSectionBuilderDynamic({
  tourId,
  routingId,
  wrappedInShell = false,
}: {
  tourId: string;
  routingId: string;
  /** Hotfix 3 §2 — passed through to AdvanceSectionBuilder so
   *  SetupMode suppresses its internal Template Library when the
   *  three-pane shell already renders one. */
  wrappedInShell?: boolean;
}) {
  return (
    <AdvanceSectionBuilder
      tourId={tourId}
      routingId={routingId}
      wrappedInShell={wrappedInShell}
    />
  );
}

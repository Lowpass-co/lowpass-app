'use client';

/* ============================================
   LOWPASS — the person panel (Nov 2026, Adam)

   Every "open this person" in the app — ⌘K, an <EntityChip>, Payroll's Name,
   Crew — lands on the SAME panel the People page uses
   (<PersonnelDetailSlideOver>), editing the ONE person record. The old
   second form here (which wrote a separate `persons` copy, plus a per-tour
   role / employment editor) is gone: `persons` is now kept in step by the
   database (migration 285), and role / employment are edited on the tour.

   A person's id is the same in both tables, so the id an entity link carries
   opens their People record directly.
   ============================================ */

import { useRef } from 'react';
import { useRouter } from 'next/navigation';
import { PersonnelDetailSlideOver } from '@/components/personnel/PersonnelDetailSlideOver';

export default function PersonSlideOver({ id, onClose }: { id: string; onClose: () => void }) {
  const router = useRouter();
  const saved = useRef(false);
  return (
    <PersonnelDetailSlideOver
      panel={{ mode: 'edit', id }}
      onSaved={() => {
        saved.current = true;
      }}
      onClose={() => {
        onClose();
        // The page behind may show their name / phone — re-read it once.
        if (saved.current) router.refresh();
      }}
    />
  );
}

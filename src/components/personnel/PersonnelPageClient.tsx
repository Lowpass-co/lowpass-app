'use client';

import { useSearchParams } from 'next/navigation';
import type { Personnel } from '@/types';
import { PersonnelRosterClient } from './PersonnelRosterClient';

export function PersonnelPageClient({ initial }: { initial: Personnel[] }) {
  const searchParams = useSearchParams();
  const focus = searchParams.get('focus');
  return <PersonnelRosterClient initial={initial} initialOpenPersonnelId={focus} />;
}

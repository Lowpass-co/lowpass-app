/* ============================================
   LOWPASS — (you) layout (S-3b)

   Shared chrome for the You scope: /settings (+ members, ai-limits), /profile
   and /bugs. These pages previously each mounted their own chrome —
   ProductShell active={null} on the settings pages and /bugs, shell-v1's
   listAppPageShell on /profile — which is exactly the drift this route group
   ends. One layout, one <ShellV3Mount>, and the pages render body only.

   The rail is ia.ts YOU_RAIL (Account / Preferences / Team & roles / Billing /
   Report a bug). resolveScope() puts these paths in the 'you' scope via
   YOU_PATHS, so the mount needs nothing but the URL.

   Route group is transparent — URLs stay /settings, /profile, /bugs.
   ============================================ */

import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { ShellV3Mount } from '@/components/shell-v3/ShellV3Mount';

export default async function YouLayout({
  children,
}: {
  children: ReactNode;
}) {
  const h = await headers();
  const pathname = h.get('x-pathname') ?? '/settings';
  const search = h.get('x-search') ?? '';

  return (
    <ShellV3Mount pathname={pathname} search={search}>
      {children}
    </ShellV3Mount>
  );
}

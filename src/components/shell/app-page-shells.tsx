/* ============================================
   LOWPASS — shell-v1 page shells (UX02/UX03)

   SUPERSEDED, NOT RETIRED — and since S-3b, ADMIN-ONLY. The canonical shell
   is <ShellV3Mount> (shell-v3); every non-admin surface is on it. What still
   mounts these:

     · listAppPageShell       → two /admin pages
     · topBarOnlyAppPageShell → three /admin playgrounds

   S-3b took /budget (tourless), /profile and the rider pack editor off this
   file and deleted builderAppPageShell with its last caller (the standalone
   <RiderPackEditorView>, now on ShellV3Mount at artist scope). S-4d had
   already deleted the four archetypes nothing mounted. What remains is the
   admin chrome — see CLAUDE.md "Shell-v1 is SCOPED TO ADMIN".
   ============================================ */

import type { ReactNode } from 'react';
import { PageShell, type PageShellArchetype } from '@/components/shell/PageShell';
import { LeftRail } from '@/components/shell/LeftRail';
import { ShellTopBarClient } from '@/components/shell/ShellTopBarClient';
import { getShellData } from '@/lib/shell/getShellData';

async function withShell(
  children: ReactNode,
  archetype: PageShellArchetype,
  leftRail: ReactNode | null
) {
  const shell = await getShellData();
  return (
    <PageShell
      archetype={archetype}
      topBar={<ShellTopBarClient shellData={shell} />}
      leftRail={leftRail}
    >
      {children}
    </PageShell>
  );
}

/** List + empty list rail (filters wired in a later UX). */
export async function listAppPageShell(children: ReactNode) {
  return withShell(
    children,
    'list',
    <LeftRail variant={{ kind: 'list', filters: [] }} />
  );
}

/**
 * PageShell with TopBar; no left rail. Use sparingly (playground, token lab).
 * Still uses a neutral list archetype for main padding.
 */
export async function topBarOnlyAppPageShell(children: ReactNode) {
  const shell = await getShellData();
  return (
    <PageShell
      archetype="list"
      topBar={<ShellTopBarClient shellData={shell} />}
      leftRail={null}
    >
      {children}
    </PageShell>
  );
}

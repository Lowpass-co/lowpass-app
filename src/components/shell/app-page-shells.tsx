/* ============================================
   LOWPASS — shell-v1 page shells (UX02/UX03)

   SUPERSEDED, NOT RETIRED. The canonical shell is <ShellV3Mount> (shell-v3),
   and new surfaces use that. These stay because real pages still mount them:

     · listAppPageShell       → /budget (no tour id), /profile, two /admin pages
     · builderAppPageShell    → <RiderPackEditorView>, the LIVE rider pack editor
     · topBarOnlyAppPageShell → three /admin playgrounds

   S-4d deleted the four archetypes nothing mounted — dashboard, docDays,
   documentSections, spreadsheet — plus <DocDaysLeftRailClient>, whose only
   caller was docDays. The three above have real callers, so retiring them
   belongs to S-3b (workspace + You) and a separate decision about /admin.
   ============================================ */

import type { ReactNode } from 'react';
import { PageShell, type PageShellArchetype } from '@/components/shell/PageShell';
import { LeftRail, type LeftRailVariant } from '@/components/shell/LeftRail';
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

export async function builderAppPageShell(
  children: ReactNode,
  rail: Extract<LeftRailVariant, { kind: 'docSections' }>
) {
  return withShell(
    children,
    'builder',
    <LeftRail variant={rail} />
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

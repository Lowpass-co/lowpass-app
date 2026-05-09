import type { ReactNode } from 'react';
import { PageShell, type PageShellArchetype } from '@/components/shell/PageShell';
import { LeftRail, type LeftRailVariant } from '@/components/shell/LeftRail';
import { ShellTopBarClient } from '@/components/shell/ShellTopBarClient';
import { getShellData } from '@/lib/shell/getShellData';
import { DocDaysLeftRailClient } from '@/components/shell/DocDaysLeftRailClient';

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

export async function dashboardAppPageShell(
  children: ReactNode,
  rail: LeftRailVariant
) {
  return withShell(
    children,
    'dashboard',
    <LeftRail variant={rail} />
  );
}

export async function docDaysAppPageShell(
  children: ReactNode,
  base: Extract<LeftRailVariant, { kind: 'docDays' }>
) {
  return withShell(
    children,
    'document',
    <DocDaysLeftRailClient base={base} />
  );
}

export async function documentSectionsAppPageShell(
  children: ReactNode,
  rail: Extract<LeftRailVariant, { kind: 'docSections' }>
) {
  return withShell(
    children,
    'document',
    <LeftRail variant={rail} />
  );
}

export async function spreadsheetAppPageShell(
  children: ReactNode,
  rail: Extract<LeftRailVariant, { kind: 'spreadsheet' }>
) {
  return withShell(
    children,
    'spreadsheet',
    <LeftRail variant={rail} />
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

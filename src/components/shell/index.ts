export { TopBar, type TopBarProps } from './TopBar';
export { LeftRail, type LeftRailProps, type LeftRailVariant, type ListFilterDef, type ShellDayType } from './LeftRail';
export { PageShell, type PageShellProps, type PageShellArchetype } from './PageShell';
export { ShellTopBarClient, type ShellTopBarClientProps } from './ShellTopBarClient';
/* SlideOver moved to @/components/ui/SlideOver — it is the app-wide detail-panel
   primitive with 26 callers, not shell chrome, and living here made "is shell-v1
   dead?" un-greppable. AccountAvatar moved for the same reason: shell-v2's
   avatar menu (which shell-v3 renders) imports it. Deliberately NOT re-exported
   from here — a barrel alias would preserve the ambiguity this move exists to
   remove. */
/* S-4d — the four archetypes nothing mounted (dashboard, docDays,
   documentSections, spreadsheet) are gone. These three have live callers. */
export {
  listAppPageShell,
  topBarOnlyAppPageShell,
} from './app-page-shells';

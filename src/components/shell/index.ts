export { TopBar, type TopBarProps } from './TopBar';
export { LeftRail, type LeftRailProps, type LeftRailVariant, type ListFilterDef, type ShellDayType } from './LeftRail';
export { PageShell, type PageShellProps, type PageShellArchetype } from './PageShell';
export { SlideOver, type SlideOverProps } from './SlideOver';
export { ShellTopBarClient, type ShellTopBarClientProps } from './ShellTopBarClient';
/* S-4d — the four archetypes nothing mounted (dashboard, docDays,
   documentSections, spreadsheet) are gone. These three have live callers. */
export {
  listAppPageShell,
  builderAppPageShell,
  topBarOnlyAppPageShell,
} from './app-page-shells';

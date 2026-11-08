/* ============================================
   LOWPASS — Getting started: the rules (Nov 2026, Adam)

   Pure. The welcome cards and the "Get set up" checklist both render from
   here; the server only reports facts (OnboardingStatus) and this file turns
   them into what to show. The checklist ticks itself — a step is done when
   the thing exists in the workspace, never because someone clicked a box.

   Every action points at a real, current surface (see src/lib/nav/ia.ts):
   Tour settings › Dates & routing, Advance, Budget → Receipts, Settings → Team & roles.
   ============================================ */

export type StepId = 'artist' | 'tour' | 'show' | 'advance' | 'receipt' | 'team';

/** What the server knows. Facts only — no wording, no URLs. */
export interface OnboardingStatus {
  /** Admin or manager: can create artists and tours. Read-only members get the welcome only. */
  canSetUp: boolean;
  /** Joined this workspace recently (the welcome may open by itself). */
  newMember: boolean;
  /** Most recently created artist / tour — where the next step's link goes. */
  artistId: string | null;
  tourId: string | null;
  done: Record<StepId, boolean>;
}

export type StepAction =
  | { kind: 'create-artist' }
  | { kind: 'create-tour'; artistId: string | null }
  | { kind: 'link'; href: string };

export interface ChecklistItem {
  id: StepId;
  title: string;
  hint: string;
  done: boolean;
  action: StepAction;
  /** Button label for the action. */
  cta: string;
}

interface StepDef {
  id: StepId;
  title: string;
  hint: string;
  cta: string;
  /** Needs a tour to point at; without one the step's action is "create a tour". */
  needsTour?: boolean;
  href?: (tourId: string) => string;
}

export const STEPS: readonly StepDef[] = [
  { id: 'artist', title: 'Add your artist', hint: 'Everything hangs off them: tours, riders, files.', cta: 'Add artist' },
  { id: 'tour', title: 'Create a tour', hint: 'Pick a template by size. Budget lines and advance questions come ready.', cta: 'New tour' },
  {
    id: 'show', title: 'Add your show dates', hint: 'Drop in a routing or tour book, or type them. They drive the advance, hotels and budget.', cta: 'Add dates',
    needsTour: true, href: (t) => `/operations/${t}/routing`,
  },
  {
    id: 'advance', title: 'Ask a venue to advance', hint: 'Send them a link. Their answers land on the show.', cta: 'Open advance',
    needsTour: true, href: (t) => `/advance/${t}`,
  },
  {
    id: 'receipt', title: 'Log a receipt', hint: 'Drop a photo or PDF. It reads the amount for you.', cta: 'Open receipts',
    needsTour: true, href: (t) => `/budget/${t}?tab=receipts`,
  },
  { id: 'team', title: 'Invite your team', hint: 'Crew see what you share with them, nothing more.', cta: 'Invite', href: () => '/settings/members' },
];

export function checklistFor(status: OnboardingStatus): ChecklistItem[] {
  return STEPS.map((s) => {
    let action: StepAction;
    let cta = s.cta;
    if (s.id === 'artist') action = { kind: 'create-artist' };
    else if (s.id === 'tour') action = { kind: 'create-tour', artistId: status.artistId };
    else if (s.needsTour && !status.tourId) {
      // Nothing to open yet — the honest next move is making the tour.
      action = { kind: 'create-tour', artistId: status.artistId };
      cta = 'New tour';
    } else action = { kind: 'link', href: s.href!(status.tourId ?? '') };
    return { id: s.id, title: s.title, hint: s.hint, done: !!status.done[s.id], action, cta };
  });
}

export function progress(items: readonly ChecklistItem[]): { done: number; total: number; next: ChecklistItem | null } {
  const done = items.filter((i) => i.done).length;
  return { done, total: items.length, next: items.find((i) => !i.done) ?? null };
}

/* ── The welcome ─────────────────────────────────────────────────────────── */

export type WelcomeArt = 'rail' | 'templates' | 'advance' | 'money';

export interface WelcomeCard {
  art: WelcomeArt;
  title: string;
  body: string;
}

export const WELCOME_CARDS: readonly WelcomeCard[] = [
  {
    art: 'rail',
    title: 'Your whole tour, in one place',
    body: 'Advance, budget and production side by side, with crew, hotels and travel. The sidebar is the map: every page of a tour is one click away.',
  },
  {
    art: 'templates',
    title: 'Start with the hard parts done',
    body: 'New tours start from a template sized to the run: support to stadium. Budget lines, commissions and advance questions come ready.',
  },
  {
    art: 'advance',
    title: 'Advance without the email chase',
    body: 'Every show on one board. Send a venue its link, or drop in their info pack and get suggested answers, each with the line it came from.',
  },
  {
    art: 'money',
    title: 'A budget that fills itself in',
    body: 'Hotels, flights, salaries and per diems flow in from the pages where you set them. Receipts read themselves. Press ⌘K to jump anywhere.',
  },
];

/* ── When things open by themselves ──────────────────────────────────────── */

export interface LocalOnboarding {
  /** Saw (finished or skipped) the welcome in this browser. */
  welcomed: boolean;
  /** Hid the checklist. */
  checklistHidden: boolean;
  /** Folded the checklist down to its pill. */
  collapsed: boolean;
}

export const EMPTY_LOCAL: LocalOnboarding = { welcomed: false, checklistHidden: false, collapsed: false };

/** Parse what localStorage holds; anything odd reads as nothing seen. */
export function parseLocal(raw: string | null): LocalOnboarding {
  if (!raw) return EMPTY_LOCAL;
  try {
    const v = JSON.parse(raw) as Partial<LocalOnboarding> | null;
    if (!v || typeof v !== 'object') return EMPTY_LOCAL;
    return { welcomed: v.welcomed === true, checklistHidden: v.checklistHidden === true, collapsed: v.collapsed === true };
  } catch {
    return EMPTY_LOCAL;
  }
}

/** The welcome opens by itself once, only for someone new: a workspace with no
 *  tour yet, or a member who just joined. A long-time user on a new laptop is
 *  not greeted again. `sawOldTutorial` is the pre-Nov-2026 panel's key. */
export function shouldAutoWelcome(status: OnboardingStatus, local: LocalOnboarding, sawOldTutorial: boolean): boolean {
  if (local.welcomed || sawOldTutorial) return false;
  return !status.done.tour || status.newMember;
}

/** The checklist shows for people who can set up, after the welcome, until it
 *  is complete-and-acknowledged or hidden. */
export function shouldShowChecklist(status: OnboardingStatus, local: LocalOnboarding): boolean {
  return status.canSetUp && local.welcomed && !local.checklistHidden;
}

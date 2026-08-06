/* ============================================
   LOWPASS — Tutorial registry

   Single source of truth for the App tour & tutorial panel
   (TutorialPanel renders this blindly). Two modes per section:

   - tourSteps: what the surface is and where things live. Every
     step that can point somewhere carries the REAL route — the
     app itself is the illustration ("Show me →" navigates there).
   - tutorialTasks: the "Weekend away" guided build. One artist,
     one Fri–Sun tour, the minimum real paperwork for it.

   Tour-scoped routes carry a ':tourId' placeholder. Resolve with
   resolveHref() before navigating; without a known tour id it
   falls back to the tourless product landing (e.g. /operations).
   ============================================ */

export type TutorialMode = 'tour' | 'tutorial';

export interface TutorialStep {
  text: string;
  /** Real app route. May contain ':tourId' — pass through resolveHref(). */
  href?: string;
}

export interface TutorialSection {
  id: string;
  label: string;
  tourSteps: TutorialStep[];
  tutorialTasks: TutorialStep[];
}

/** Substitute ':tourId' when a tour is known; otherwise land on the
 *  tourless product root ('/operations/:tourId/riders' → '/operations'). */
export function resolveHref(href: string, tourId?: string | null): string {
  if (!href.includes(':tourId')) return href;
  if (tourId) return href.replace(':tourId', tourId);
  const root = href.split('/')[1];
  return root ? `/${root}` : '/artists';
}

/** Stable per-task key used for progress persistence. */
export function taskKey(sectionId: string, taskIndex: number): string {
  return `${sectionId}:${taskIndex}`;
}

export const TUTORIAL_SECTIONS: TutorialSection[] = [
  {
    id: 'welcome',
    label: 'Welcome',
    tourSteps: [
      {
        text: 'Lowpass runs the tour: routing, advancing, production paperwork, money.',
        href: '/artists',
      },
      {
        text: 'Tour mode walks each surface. Tutorial mode builds a three-day run for real.',
      },
      {
        text: 'Reopen any time from the avatar menu. Esc closes; progress is saved.',
      },
    ],
    tutorialTasks: [
      { text: 'Plan ten minutes. Everything you build here is real data.' },
    ],
  },
  {
    id: 'shell',
    label: 'Shell',
    tourSteps: [
      {
        text: 'The top path reads workspace / artist / tour. Click a crumb to zoom out.',
        href: '/artists',
      },
      {
        text: 'The Tour · Money · Production slider swaps the rail. It exists at tour scope only.',
        href: '/operations/:tourId',
      },
      {
        text: 'The rail maps the current mode. The orange bar marks where you are.',
        href: '/operations/:tourId',
      },
    ],
    tutorialTasks: [
      {
        text: 'Open the tour. Flip the slider to Money, then back to Tour.',
        href: '/operations/:tourId',
      },
      {
        text: 'Click the workspace crumb, then return.',
        href: '/artists',
      },
    ],
  },
  {
    id: 'artists',
    label: 'Artists',
    tourSteps: [
      {
        text: 'Artists sit at workspace level. They own what outlives a tour: year budget, master rider, files.',
        href: '/artists',
      },
      {
        text: 'New artist needs one field, the name.',
        href: '/artists',
      },
    ],
    tutorialTasks: [
      { text: 'Open Artists. Click New artist.', href: '/artists' },
      { text: 'Name it My Band. Leave the rest blank.', href: '/artists' },
    ],
  },
  {
    id: 'tour_builder',
    label: 'Tour builder',
    tourSteps: [
      {
        text: 'A tour is a name, a date range and a currency.',
        href: '/artists',
      },
      {
        text: 'The builder grid roughs in days. One row per day; Enter adds the next.',
        href: '/operations/:tourId',
      },
      {
        text: 'Create turns the grid into the routing ledger.',
        href: '/operations/:tourId',
      },
    ],
    tutorialTasks: [
      { text: 'From My Band, click New tour.', href: '/artists' },
      {
        text: 'Name it Weekend Away. Set Fri 14 – Sun 16 Aug, currency GBP.',
        href: '/artists',
      },
      {
        text: 'Create. You land on an empty routing ledger.',
        href: '/operations/:tourId',
      },
    ],
  },
  {
    id: 'routing',
    label: 'Routing',
    tourSteps: [
      {
        text: 'The routing ledger is the spine. Each day is a row with a type: show, travel, day off.',
        href: '/operations/:tourId',
      },
      {
        text: 'The venue cell searches your library first, then Google. Enter commits free text.',
        href: '/operations/:tourId',
      },
      {
        text: 'Expand a day for times, contacts and notes. The day sheet builds from these.',
        href: '/operations/:tourId',
      },
    ],
    tutorialTasks: [
      {
        text: 'Add Fri 14 as a show. Venue: The Lexington, London.',
        href: '/operations/:tourId',
      },
      {
        text: 'Add Sat 15 as a show. Venue: Joiners, Southampton.',
        href: '/operations/:tourId',
      },
      { text: 'Add Sun 16 as a day off.', href: '/operations/:tourId' },
      {
        text: 'Expand Friday. Set doors 19:00, stage 21:00.',
        href: '/operations/:tourId',
      },
    ],
  },
  {
    id: 'riders_channel',
    label: 'Riders & channels',
    tourSteps: [
      {
        text: 'Production mode holds venue paperwork. A rider stacks sections into a printable pack.',
        href: '/operations/:tourId/riders',
      },
      {
        text: 'The channel list is a compact grid: number, source, mic, notes.',
        href: '/operations/:tourId/channel-list',
      },
      {
        text: 'Versions save per tour and attach per show.',
        href: '/operations/:tourId/riders',
      },
    ],
    tutorialTasks: [
      {
        text: 'Open Riders. Add a section named Technical.',
        href: '/operations/:tourId/riders',
      },
      { text: 'Write one line in it.', href: '/operations/:tourId/riders' },
      {
        text: 'Open Channel list. Add four rows: kick, snare, bass DI, vox.',
        href: '/operations/:tourId/channel-list',
      },
    ],
  },
  {
    id: 'stage_plot',
    label: 'Stage plot',
    tourSteps: [
      {
        text: 'Drag items from the palette: risers, wedges, mics, power.',
        href: '/operations/:tourId/stage-plot',
      },
      {
        text: 'Export sends the plot and channel list into the advance packet.',
        href: '/operations/:tourId/stage-plot',
      },
    ],
    tutorialTasks: [
      {
        text: 'Open Stage plot. Place a drum riser upstage centre.',
        href: '/operations/:tourId/stage-plot',
      },
      {
        text: 'Add two wedges and a vox mic downstage.',
        href: '/operations/:tourId/stage-plot',
      },
    ],
  },
  {
    id: 'advance',
    label: 'Advance',
    tourSteps: [
      {
        text: 'One packet per show: contacts, schedule, tech, hospitality.',
        href: '/advance/:tourId',
      },
      {
        text: 'The rail badge counts advanced shows.',
        href: '/advance/:tourId',
      },
      {
        text: 'Times come from routing. Tech comes from the rider and plot; nothing is typed twice.',
        href: '/advance/:tourId',
      },
    ],
    tutorialTasks: [
      { text: 'Open the advance for Friday.', href: '/advance/:tourId' },
      {
        text: 'Fill the promoter contact. Any name and email.',
        href: '/advance/:tourId',
      },
    ],
  },
  {
    id: 'budget',
    label: 'Budget',
    tourSteps: [
      {
        text: 'Money mode. The summary reads the whole tour; lines live in the expense grid.',
        href: '/budget/:tourId',
      },
      {
        text: 'Committed vs remaining runs across every money page.',
        href: '/budget/:tourId',
      },
    ],
    tutorialTasks: [
      {
        text: 'Open Expenses. Add one line: van hire, 250, Transport.',
        href: '/budget/:tourId',
      },
      {
        text: 'Check the summary. The line shows under committed.',
        href: '/budget/:tourId',
      },
    ],
  },
  {
    id: 'settlement',
    label: 'Settlement',
    tourSteps: [
      {
        text: 'One sheet per show: guarantee, actuals, deductions.',
        href: '/budget/:tourId/settlement',
      },
      {
        text: 'Mark settled locks the sheet and feeds the tour P&L.',
        href: '/budget/:tourId/settlement',
      },
    ],
    tutorialTasks: [
      {
        text: 'Open the settlement sheet for Friday.',
        href: '/budget/:tourId/settlement',
      },
      {
        text: 'Enter a 500 guarantee. Mark settled.',
        href: '/budget/:tourId/settlement',
      },
    ],
  },
  {
    id: 'share',
    label: 'Share',
    tourSteps: [
      {
        text: 'Every show has a link. The venue opens it without a login.',
        href: '/advance/:tourId',
      },
      {
        text: 'Mint it from the advance packet: Public share, Copy show link.',
        href: '/advance/:tourId',
      },
      {
        text: 'It carries the form, rider, channel list, stage plot and PDFs.',
        href: '/advance/:tourId',
      },
    ],
    tutorialTasks: [
      {
        text: 'On Friday, click Share. Generate the show link.',
        href: '/operations/:tourId',
      },
      {
        text: 'Open the link in a new tab. That is the venue view.',
        href: '/operations/:tourId',
      },
    ],
  },
  {
    id: 'finish',
    label: 'Finish',
    tourSteps: [
      {
        text: 'The loop: artist, tour, routing, paperwork, advance, money, settle, share.',
        href: '/artists',
      },
      { text: 'Switch to Tutorial mode and build one.' },
    ],
    tutorialTasks: [
      {
        text: 'Review the tour: three days, a rider, channels, a plot, an advance, a budget line, a live link.',
        href: '/operations/:tourId',
      },
      {
        text: 'Keep it as a sandbox, or delete it from the tours list.',
        href: '/artists',
      },
    ],
  },
];

/** Total tutorial tasks across all sections — the "N of M" denominator. */
export const TOTAL_TUTORIAL_TASKS = TUTORIAL_SECTIONS.reduce(
  (n, s) => n + s.tutorialTasks.length,
  0,
);

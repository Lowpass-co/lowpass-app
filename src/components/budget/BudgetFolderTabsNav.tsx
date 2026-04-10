'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { BUDGET_TABS, type TabId } from './budget-tabs';
import { BudgetTabIcon } from './budget-tab-icons';

const FOLDER_CLIP =
  '[clip-path:polygon(4px_0,calc(100%-4px)_0,100%_100%,0_100%)]' as const;

/** Active tab: trapezoid + full-width tail below (px) so bleed is one shape, not a second layer */
const ACTIVE_TAB_BODY_PX = 52;
const ACTIVE_TAB_TAIL_PX = 14;
export const ACTIVE_TAB_TOTAL_PX = ACTIVE_TAB_BODY_PX + ACTIVE_TAB_TAIL_PX;

/** Must match budget page sticky header `pt-*` (Tailwind pt-6) */
export const BUDGET_FOLDER_HEADER_PT = '1.5rem';
/** Opaque band below folder row — masks scroll “slither” before Routing/Income sub-tabs */
export const BUDGET_FOLDER_HEADER_PB = '0.75rem';

/**
 * Scroll offset for Income sub-tabs = header pt + nav ul pt-1 + active tab height + header pb.
 * Keep in sync with `budget/page.tsx` sticky `<header>` classes.
 */
/** −1px overlaps header pb band to remove any hairline between folder row and sub-tabs */
export const BUDGET_FOLDER_STICKY_STACK_TOP =
  `calc(${BUDGET_FOLDER_HEADER_PT} + 0.25rem + ${ACTIVE_TAB_TOTAL_PX}px + ${BUDGET_FOLDER_HEADER_PB} - 1px)` as const;

const FOLDER_CLIP_ACTIVE =
  `[clip-path:polygon(4px_0,calc(100%-4px)_0,100%_${ACTIVE_TAB_BODY_PX}px,100%_100%,0_100%,0_${ACTIVE_TAB_BODY_PX}px)]` as const;

/** Brand orange — inactive tabs use this for icon/text; active tab fill */
const TAB_ORANGE = '#FF4500';

/**
 * One gradient over body + tail (no separate bleed strip) so nothing cuts off at the trapezoid base.
 * Pixel stops are relative to the full active tab height (body + tail).
 */
const activeTabUnifiedGradient = `linear-gradient(180deg,
  ${TAB_ORANGE} 0,
  ${TAB_ORANGE} 21px,
  color-mix(in srgb, var(--lp-budget-wrap-bg) 6%, ${TAB_ORANGE}) 26px,
  color-mix(in srgb, var(--lp-budget-wrap-bg) 12%, ${TAB_ORANGE}) 30px,
  color-mix(in srgb, var(--lp-budget-wrap-bg) 20%, ${TAB_ORANGE}) 34px,
  color-mix(in srgb, var(--lp-budget-wrap-bg) 28%, ${TAB_ORANGE}) 38px,
  color-mix(in srgb, var(--lp-budget-wrap-bg) 38%, ${TAB_ORANGE}) 42px,
  color-mix(in srgb, var(--lp-budget-wrap-bg) 48%, ${TAB_ORANGE}) 45px,
  color-mix(in srgb, var(--lp-budget-wrap-bg) 58%, ${TAB_ORANGE}) 48px,
  color-mix(in srgb, var(--lp-budget-wrap-bg) 68%, ${TAB_ORANGE}) 51px,
  color-mix(in srgb, var(--lp-budget-wrap-bg) 78%, ${TAB_ORANGE}) 54px,
  color-mix(in srgb, var(--lp-budget-wrap-bg) 86%, ${TAB_ORANGE}) 56px,
  color-mix(in srgb, var(--lp-budget-wrap-bg) 92%, ${TAB_ORANGE}) 58px,
  color-mix(in srgb, var(--lp-budget-wrap-bg) 96%, ${TAB_ORANGE}) 59px,
  var(--lp-budget-wrap-bg) 60px,
  var(--lp-budget-wrap-bg) 100%)`;

/**
 * Min width so the longest tab label (e.g. “Salary & Per Diems”) stays on one line
 * at the tab font sizes, including uppercase + tracking. Active `li` and inactive
 * hover use the same numbers so selected vs opened tabs align.
 */
const TAB_COL_MIN = 'min-w-[10.5rem] sm:min-w-[12rem]';

/**
 * Inactive hover: fixed width = active column min (uniform + no mid-animation wrap).
 */
const INACTIVE_HOVER_W = [
  'hover:z-[18]',
  'hover:min-w-[10.5rem]',
  'hover:max-w-[10.5rem]',
  'sm:hover:min-w-[12rem]',
  'sm:hover:max-w-[12rem]',
  'focus-visible:z-[18]',
  'focus-visible:min-w-[10.5rem]',
  'focus-visible:max-w-[10.5rem]',
  'sm:focus-visible:min-w-[12rem]',
  'sm:focus-visible:max-w-[12rem]',
] as const;

/** Extra hit area below the trapezoid (cursor seam / between-tabs glitch) */
const TAB_HIT_EXTEND = 'pb-4 -mb-4';

/** Inactive tab open (width, lift, label) — slow + smooth */
const TAB_OPEN_DURATION = 'duration-[850ms]';
const TAB_OPEN_EASE = 'ease-[cubic-bezier(0.2,0.85,0.32,1)]';

export function BudgetFolderTabsNav({ tourId, activeTab }: { tourId: string; activeTab: string }) {
  return (
    <nav
      className="lp-budget-folder-tabs relative z-10 w-full overflow-visible"
      aria-label="Budget folder tabs"
    >
      <ul className="list-none flex w-max max-w-full flex-nowrap items-end justify-start gap-px overflow-visible pb-0 pt-1">
        {BUDGET_TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const id = tab.id as TabId;
          return (
            <li
              key={tab.id}
              className={cn(
                'relative flex shrink-0 items-end justify-center overflow-visible',
                isActive && cn('z-20', TAB_COL_MIN)
              )}
            >
              <Link
                href={`/budget?tour_id=${tourId}&view=detail&tab=${tab.id}`}
                title={tab.label}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  // box-content: padding-bottom extends the real <a> hit target below the clipped shape
                  'group/tab relative z-0 box-content flex flex-col items-stretch',
                  TAB_HIT_EXTEND,
                  isActive
                    ? ['w-full max-w-full', 'outline-none ring-0']
                    : [
                        'min-w-[3.35rem] max-w-[3.35rem]',
                        'outline-none ring-0',
                        'transition-[min-width,max-width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]',
                        ...INACTIVE_HOVER_W,
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4500]/30 focus-visible:ring-inset',
                      ]
                )}
              >
                <span
                  className={cn(
                    'relative z-0 flex min-h-0 w-full flex-col overflow-visible rounded-t-[10px] text-[11px] font-semibold uppercase tracking-wide',
                    isActive ? FOLDER_CLIP_ACTIVE : FOLDER_CLIP,
                    isActive ? '-mb-px' : 'h-[52px]',
                    isActive
                      ? ['translate-y-0 items-stretch border-0 shadow-none']
                      : [
                          'items-center border-0 bg-lp-bg-tertiary/80 px-2.5 py-2 text-[#FF4500]',
                          'translate-y-0 justify-center gap-0',
                          'transition-[transform,background-color]',
                          TAB_OPEN_DURATION,
                          TAB_OPEN_EASE,
                          'group-hover/tab:z-[18] group-hover/tab:-translate-y-1 group-hover/tab:justify-end group-hover/tab:gap-1',
                          'group-hover/tab:bg-lp-bg-tertiary/95',
                          'group-focus-visible/tab:z-[18] group-focus-visible/tab:-translate-y-1 group-focus-visible/tab:justify-end group-focus-visible/tab:gap-1',
                          'group-focus-visible/tab:bg-lp-bg-tertiary/95',
                        ]
                  )}
                  style={
                    isActive
                      ? {
                          background: activeTabUnifiedGradient,
                          height: `${ACTIVE_TAB_TOTAL_PX}px`,
                        }
                      : undefined
                  }
                >
                  {isActive ? (
                    <span className="flex h-[52px] min-h-[52px] w-full flex-col items-center justify-end gap-1 px-2.5 pb-3.5 pt-2.5">
                      <span className="relative z-[1] flex min-h-0 shrink-0 items-center justify-center">
                        <BudgetTabIcon
                          tabId={id}
                          className="h-4 w-4 shrink-0 text-white [filter:drop-shadow(0_1px_1px_rgba(0,0,0,0.2))] dark:text-black dark:[filter:none]"
                        />
                      </span>
                      <span
                        className={cn(
                          'relative z-[1] max-w-full whitespace-nowrap px-0.5 text-center text-xs font-semibold leading-tight',
                          'text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.22)]',
                          'dark:text-black dark:[text-shadow:0_1px_0_rgba(255,255,255,0.2)]'
                        )}
                      >
                        {tab.label}
                      </span>
                    </span>
                  ) : (
                    <>
                      <span className="relative z-[1] flex min-h-0 shrink-0 items-center justify-center">
                        <BudgetTabIcon tabId={id} className="h-4 w-4 shrink-0 text-[#FF4500]" />
                      </span>

                      <span className="sr-only">{tab.label}</span>

                      <span
                        aria-hidden
                        className={cn(
                          'relative z-[1] min-h-0 w-full max-w-full shrink-0 overflow-hidden px-0.5 text-center text-xs font-semibold leading-tight text-[#FF4500]',
                          'whitespace-nowrap',
                          'max-h-0 opacity-0',
                          'transition-[max-height,opacity]',
                          TAB_OPEN_DURATION,
                          TAB_OPEN_EASE,
                          'group-hover/tab:max-h-[2.75rem] group-hover/tab:py-0.5 group-hover/tab:opacity-100',
                          'group-focus-visible/tab:max-h-[2.75rem] group-focus-visible/tab:py-0.5 group-focus-visible/tab:opacity-100'
                        )}
                      >
                        {tab.label}
                      </span>
                    </>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

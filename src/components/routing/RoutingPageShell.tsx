/* ============================================

   LOWPASS — Routing Page Shell

   Layout wrapper for the routing page.

   Desktop (≥768px):

     ┌───────────────── header ──────────────────┐

     │ main content           │   right rail     │

     │ (RoutingEditor)        │   (at a glance)  │

     └──────────────────────────────────────────┘

   Mobile (<768px):

     header (w/ toggle if rightRail present)

     main content

     [right rail inline when toggle is open]

   ============================================ */

'use client';

import { useState, type ReactNode } from 'react';

import { PanelRight, PanelRightClose } from 'lucide-react';

import { useIsMobile } from '@/hooks/useIsMobile';

export function RoutingPageShell({

  title,

  subtitle,

  rightRail,

  children,

}: {

  title: string;

  subtitle?: string;

  rightRail?: ReactNode;

  children: ReactNode;

}) {

  const isMobile = useIsMobile();

  const [mobileRailOpen, setMobileRailOpen] = useState(false);

  const hasRail = rightRail != null;

  const showRailInline = hasRail && (!isMobile || mobileRailOpen);

  return (

    <div className="flex min-h-0 flex-1 flex-col">

      {/* Header */}

      <div className="flex items-start justify-between gap-4 border-b border-lp-border pb-4">

        <div className="min-w-0">

          <h1 className="truncate text-2xl font-semibold text-lp-text">{title}</h1>

          {subtitle && (

            <p className="mt-1 truncate text-sm text-lp-text-secondary">{subtitle}</p>

          )}

        </div>

        {hasRail && isMobile && (

          <button

            type="button"

            onClick={() => setMobileRailOpen((v) => !v)}

            aria-expanded={mobileRailOpen}

            aria-controls="routing-right-rail"

            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-lp-border bg-lp-surface text-lp-text hover:bg-lp-surface-hover"

            title={mobileRailOpen ? 'Hide summary' : 'Show summary'}

          >

            {mobileRailOpen ? (

              <PanelRightClose className="h-4 w-4" aria-hidden />

            ) : (

              <PanelRight className="h-4 w-4" aria-hidden />

            )}

          </button>

        )}

      </div>

      {/* Body */}

      {hasRail ? (

        <div

          className={

            isMobile

              ? 'flex min-h-0 flex-1 flex-col'

              : 'grid min-h-0 flex-1 grid-cols-[1fr_320px]'

          }

        >

          <div className="min-w-0 pt-6">{children}</div>

          {showRailInline && (

            <div

              id="routing-right-rail"

              className={isMobile ? 'mt-6' : 'pl-0'}

            >

              {rightRail}

            </div>

          )}

        </div>

      ) : (

        <div className="min-h-0 flex-1 pt-6">{children}</div>

      )}

    </div>

  );

}

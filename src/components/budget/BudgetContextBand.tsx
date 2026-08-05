'use client';

/* ============================================
   LOWPASS — <BudgetContextBand> (bar consolidation, 2026-08-04)

   THE one budget toolbar. Everything the budget page keeps above its content
   now lives in this single sticky row:

     [Version selector]  [burn meter — remaining · fill · vs committed]  [density] [export]

   History, because this row is where three generations of bars collapsed to:
   the Summary/Expenses/Income tab strip moved to the MONEY RAIL in S-2b (and
   the dead `items` branch this band kept for unshelled chrome was deleted with
   S-3b — every /budget URL is shelled now); the tour-identity header moved to
   the top bar's switcher; and the standalone <BudgetBurnBar> row folded in
   here as the band's flexible middle (`inline` mode) — one frame, one border,
   one sticky offset, instead of a stack of near-empty strips. Adam's ask:
   "fix the multitude of bars."

   The Receipts needs-details badge lives on the rail item (ShellV3Mount feeds
   `receiptsNeedingDetails`), not here. The FX banner, phase strip and
   data-health banner stay OUTSIDE this band on purpose: they are conditional
   messages, not chrome, and only render when they have something to say.

   Routing is unchanged (?tab=…, driven by the rail). Token-clean.
   ============================================ */

import { BudgetExportControls } from '@/components/budget/BudgetExportControls';
import { BudgetBurnBar } from '@/components/budget/BudgetBurnBar';
import { AppDensityToggle } from '@/lib/density/appDensity';
import type { FxRateMap } from '@/lib/budget/fxRates';
import { VersionSelector } from './versioning/VersionSelector';
import type { BudgetVersionVm } from './versioning/versionApi';
import type { BudgetLineItem } from '@/types';

interface BudgetContextBandProps {
  tourCurrency: string;
  /** Feeds the inline burn meter. */
  lines: BudgetLineItem[];
  tourId: string;
  versions: BudgetVersionVm[];
  viewedVersionId: string | null;
  canApprove: boolean;
  /** FX map for the meter's display-currency conversions. */
  fxRates?: FxRateMap;
  /** False on the Summary tab — its dashboard owns the money display there
   *  (D-preflight #4), so the band shows controls with a plain spacer. */
  showMeter?: boolean;
}

export function BudgetContextBand({
  tourCurrency,
  lines,
  tourId,
  versions,
  viewedVersionId,
  canApprove,
  fxRates,
  showMeter = true,
}: BudgetContextBandProps) {
  return (
    <div
      className="sticky top-0 z-30 flex items-center gap-4 border-b px-4 py-2"
      style={{
        background: 'var(--lp-panel)',
        borderColor: 'var(--lp-border-strong)',
      }}
    >
      <div className="flex shrink-0 items-center gap-3">
        <VersionSelector
          tourId={tourId}
          versions={versions}
          viewedVersionId={viewedVersionId}
          canApprove={canApprove}
        />
      </div>

      {showMeter ? (
        <BudgetBurnBar inline lines={lines} tourCurrency={tourCurrency} fxRates={fxRates} />
      ) : (
        <div className="min-w-0 flex-1" aria-hidden />
      )}

      <div className="flex shrink-0 items-center gap-2">
        {/* App-wide density preference (`lowpass:density`) — same toggle every
            grid reads via useAppDensity. */}
        <AppDensityToggle />
        <BudgetExportControls tourCurrency={tourCurrency} tourId={tourId} />
      </div>
    </div>
  );
}

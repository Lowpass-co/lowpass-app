/* ============================================
   LOWPASS — Advance builder BLOCK REGISTRY (P6)

   A real, data-driven registry of typed advance blocks — the thing the P6 spec
   requires so the Labor-call block is REGISTERED, not dispatched by a hardcoded
   `section.label === X && field.id === Y` label-match (the pre-existing MealTimes
   pattern).

   A block is registered by its `type` key (= the section field's `type`). The
   FillMode canvas, the builder palette, the read/day-sheet view, and the intake
   schema all consult THIS map — adding a new block means adding one entry here,
   with zero edits to those dispatch sites.

   (Only the Labor-call block is registered today; MealTimes/drive_distance keep
   their legacy label-match until they're migrated into the registry.)
   ============================================ */

import type { ComponentType } from 'react';
import { LaborCallBlock } from '@/components/advance/labor/LaborCallBlock';
import { LaborCallReadView } from '@/components/advance/labor/LaborCallReadView';

/** Props every registered block's editor receives from the FillMode canvas. */
export interface AdvanceBlockEditorProps {
  tourId: string;
  routingId: string;
  /** Read-only when the surface is a locked/preview view. */
  readOnly?: boolean;
}

/** Props every registered block's read/day-sheet view receives. */
export interface AdvanceBlockReadProps {
  tourId: string;
  routingId: string;
}

export interface AdvanceBlockDef {
  /** Matches a section field's `type`. */
  type: string;
  /** Palette + section-card label. */
  label: string;
  /** Shown in the builder's add-block palette. */
  description: string;
  /** Venue/local-production can fill this block through the intake form. */
  intakeFillable: boolean;
  /** The editing surface (FillMode canvas). */
  Editor: ComponentType<AdvanceBlockEditorProps>;
  /** The read surface (day sheet / /m/today / export). */
  ReadView: ComponentType<AdvanceBlockReadProps>;
}

export const ADVANCE_BLOCKS: Record<string, AdvanceBlockDef> = {
  labor_call: {
    type: 'labor_call',
    label: 'Labor call',
    description: 'Per-day crew call schedule — department · call · heads · company · contact.',
    intakeFillable: true,
    Editor: LaborCallBlock,
    ReadView: LaborCallReadView,
  },
};

/** Registry lookup — the single dispatch point. Returns undefined for plain
 *  fields (which fall through to the generic FieldRenderer). */
export function getAdvanceBlock(type: string | null | undefined): AdvanceBlockDef | undefined {
  return type ? ADVANCE_BLOCKS[type] : undefined;
}

/** All registered blocks (for the builder's add-block palette). */
export function registeredBlocks(): AdvanceBlockDef[] {
  return Object.values(ADVANCE_BLOCKS);
}

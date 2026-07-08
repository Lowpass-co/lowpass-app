/* ============================================================
   LOWPASS — Advance save payload builders (B1 · SAFETY ADD)

   Pure builders for the two Advance save paths, extracted during the P3
   decomposition so each surface's autosave can be characterization-tested
   WITHOUT a browser (the component itself can't be rendered in node). These
   MUST match map §5 exactly — the two endpoints are structurally different and
   must never be merged:

   - Build (structure)  → POST  /api/tours/[id]/advance
                          { routing_id, sections }
   - Advance (fill)     → PATCH /api/tours/[id]/advance/[routingId]
                          { data?, section_statuses?, status?, flags? }
                          (only the keys that changed — undefined keys dropped)
   ============================================================ */

import type {
  SectionDef,
  AdvanceData,
  SectionStatuses,
  AdvanceFlag,
} from './model';

/** POST body for the Build/structure autosave (800ms debounce). */
export interface StructurePayload {
  routing_id: string;
  sections: SectionDef[];
}

export function buildStructurePayload(
  routingId: string,
  sections: SectionDef[],
): StructurePayload {
  return { routing_id: routingId, sections };
}

/** Accumulated fill patch — the subset of fields that changed since the last
 *  flush. Mirrors the FillMode `patchRef` shape. */
export interface FillPatch {
  data?: AdvanceData;
  section_statuses?: SectionStatuses;
  status?: string;
  flags?: AdvanceFlag[];
}

/**
 * PATCH body for the Advance/fill autosave (2000ms debounce; status/assignee/
 * flags flush immediately). Drops keys whose value is `undefined` so an empty
 * accumulator produces `{}` (caller skips the request).
 */
export function buildFillPayload(patch: FillPatch): FillPatch {
  const out: FillPatch = {};
  if (patch.data !== undefined) out.data = patch.data;
  if (patch.section_statuses !== undefined) out.section_statuses = patch.section_statuses;
  if (patch.status !== undefined) out.status = patch.status;
  if (patch.flags !== undefined) out.flags = patch.flags;
  return out;
}

/* ============================================
   LOWPASS — Operations · Payroll (Phase 1 §C placeholder)

   /operations/[tourId]/payroll — replaces /tours/[id]/payroll. Phase 4
   ports the existing surface onto the new shell.

   Sprint 8.1 §2 — ProductShell hoisted to /operations/[tourId]/layout.tsx.
   ============================================ */

import { PhaseScaffoldPlaceholder } from '@/components/shell-v2/PhaseScaffoldPlaceholder';

export default function OperationsTourPayrollPage() {
  return (
    <PhaseScaffoldPlaceholder
      title="Operations · Payroll"
      phase="Phase 4"
      body={`Tour Payroll captures per-week / per-show pay for personnel assigned to this tour. Phase 4 ports it onto the new shell.`}
    />
  );
}

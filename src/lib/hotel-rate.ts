/** Stay length from hotel booking dates (checkout minus check-in, whole nights). */
export function nightsBetweenHotelStay(checkIn: string | null, checkOut: string | null): number | null {
  if (!checkIn || !checkOut) return null;
  const a = new Date(checkIn + 'T12:00:00');
  const b = new Date(checkOut + 'T12:00:00');
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
}

/** Prefer stay nights from booking dates; otherwise sum of assignment nights. */
export function hotelRateDenominatorNights(stayNights: number | null, totalAssignmentNights: number): number {
  if (stayNights != null && stayNights > 0) return stayNights;
  return Math.max(0, totalAssignmentNights);
}

/** Actual is treated as "confirmed" when strictly positive (shows actual-based rate). */
/* NOT A HOOK, despite the old name. It is a pure predicate over a number — no
   state, no effects, no React at all. The `use` prefix made eslint's
   rules-of-hooks treat every call site as a hook call, which is why calling it
   from the plain function below was reported as an error: the name was the
   defect, not the code. Renamed rather than suppressed, because the old name
   also told every reader they could not call this outside a component. */
export function shouldUseActualHotelCost(actualCost: number | null | undefined): boolean {
  return Number(actualCost ?? 0) > 0;
}

/** Blended rate/night: proposed ÷ nights until actual is set (positive), then actual ÷ nights. */
export function impliedRatePerNight(
  proposedCost: number | null | undefined,
  actualCost: number | null | undefined,
  denomNights: number
): number | null {
  if (denomNights <= 0) return null;
  const useActual = shouldUseActualHotelCost(actualCost);
  const total = useActual ? Number(actualCost ?? 0) : Number(proposedCost ?? 0);
  return total / denomNights;
}

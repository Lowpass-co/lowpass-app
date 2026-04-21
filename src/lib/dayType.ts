/**
 * Canonical day-type helpers for Lowpass routing rows.
 *
 * `day_type` is a free-form comma-separated string on the `routing` table
 * (e.g. "show", "show, press", "travel", "festival", "off"). These helpers
 * parse it, pick the most significant segment by priority, and return a
 * human label or the Lowpass accent colour.
 *
 * Styling helpers that return Tailwind classes (e.g. dayTypeClass,
 * dayDotClass) stay local to their components - those are per-component
 * design decisions that will be aligned in a separate pass.
 */
export function dayTypeSegments(dayType: string): string[] {
  return (dayType ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function dayTypeAccent(dayType: string): string {
  const segs = dayTypeSegments(dayType);
  if (segs.some((s) => s === 'show')) return '#FF4500'; // Lowpass brand orange
  if (segs.some((s) => s === 'festival')) return '#9B59B6'; // purple
  if (segs.some((s) => s === 'travel')) return '#3498DB'; // blue
  if (segs.some((s) => s === 'rehearsal')) return '#F59E0B'; // amber
  if (segs.some((s) => s === 'off')) return '#64748B'; // slate-500
  return 'var(--lp-sidebar-text-muted)'; // unknown -> muted
}

export function dayTypeLabel(dayType: string): string {
  const segs = dayTypeSegments(dayType);
  const priority = ['show', 'festival', 'travel', 'rehearsal', 'press', 'off'];
  const primary = priority.find((p) => segs.includes(p)) ?? segs[0];

  switch (primary) {
    case 'show':
      return 'Show Day';
    case 'festival':
      return 'Festival';
    case 'travel':
      return 'Travel Day';
    case 'rehearsal':
      return 'Rehearsal';
    case 'press':
      return 'Press Day';
    case 'off':
      return 'Off Day';
    default:
      return primary ? primary.charAt(0).toUpperCase() + primary.slice(1) : '';
  }
}

export function formatDateHeading(dateStr: string): string {
  // "TUESDAY, MAY 19"
  return new Date(`${dateStr}T12:00:00`)
    .toLocaleDateString('en-GB', { weekday: 'long', month: 'long', day: 'numeric' })
    .toUpperCase();
}

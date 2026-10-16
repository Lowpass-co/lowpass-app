/* ============================================
   LOWPASS — sheet palette (Oct 2026)

   Adam's Google Sheets colour language, as one lookup: a payroll pay status,
   a routing day type, or a room code → { bg, fg, label }. Light mode is his
   sheets exactly (tokens in globals.css "Sheet palette"); dark mode is the same
   hues at dark-safe strength. Labels are full words, as on his sheets — never
   single letters.
   ============================================ */

export interface SheetSwatch {
  bg: string;
  fg: string;
  label: string;
}

const sw = (key: string, label: string): SheetSwatch => ({
  bg: `var(--lp-sheet-${key}-bg)`,
  fg: `var(--lp-sheet-${key}-fg)`,
  label,
});

/** Payroll pay status (day_statuses values) → swatch. no_tour / unknown → null. */
const STATUS: Record<string, SheetSwatch> = {
  show: sw('show', 'SHOW'),
  travel: sw('travel', 'TRAVEL'),
  off_travel: sw('travel', 'TRAVEL'),
  off: sw('off', 'OFF'),
  rehearsal: sw('rehearsal', 'REHEARSAL'),
  promo_radio: sw('promo', 'PROMO'),
  pd_only: sw('pd', 'PD ONLY'),
};
export function statusSwatch(status: string | null | undefined): SheetSwatch | null {
  return STATUS[(status ?? '').trim()] ?? null;
}

/** Routing day type (free text, may be CSV) → swatch, keyed on the first type. */
const DAY_TYPE: Record<string, SheetSwatch> = {
  show: sw('show', 'SHOW'),
  festival: sw('show', 'FESTIVAL'),
  travel: sw('travel', 'TRAVEL'),
  off: sw('off', 'OFF'),
  rehearsal: sw('rehearsal', 'REHEARSAL'),
  prep: sw('prep', 'PREP'),
  press: sw('promo', 'PRESS'),
  radio: sw('promo', 'RADIO'),
  tv: sw('promo', 'TV'),
};
export function dayTypeSwatch(dayType: string | null | undefined): SheetSwatch | null {
  const first = (dayType ?? '').split(',')[0].trim().toLowerCase();
  if (!first) return null;
  return DAY_TYPE[first] ?? { ...sw('travel', first.toUpperCase()) };
}

/** Rooming room code → swatch. '-' / empty → null. */
const ROOM: Record<string, SheetSwatch> = {
  SGL: sw('room-sgl', 'SGL'),
  'DBL (A)': sw('room-a', 'DBL (A)'),
  'DBL (B)': sw('room-b', 'DBL (B)'),
  'DBL (C)': sw('room-c', 'DBL (C)'),
  'DBL (D)': sw('room-d', 'DBL (D)'),
};
export function roomSwatch(code: string | null | undefined): SheetSwatch | null {
  return ROOM[(code ?? '').trim()] ?? null;
}
export const ROOM_SWATCH_CODES = Object.keys(ROOM);

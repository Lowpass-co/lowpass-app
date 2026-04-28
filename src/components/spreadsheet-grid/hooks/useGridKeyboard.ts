/**
 * Complex keyboard handling for SpreadsheetGrid is implemented in
 * SpreadsheetGrid.tsx to keep a single `onKeyDown` with access to
 * selection, editing, and row/column model. This module exists to match
 * the UX06 file tree and can host small helpers in v2.
 */
export function isNavKey(e: globalThis.KeyboardEvent) {
  return ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter', 'Escape', 'F2'].includes(
    e.key
  );
}

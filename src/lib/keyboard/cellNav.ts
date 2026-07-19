/* ============================================
   LOWPASS — cell keyboard nav helper (CC_ROUTING_KEYBOARD)

   The house rule (design-tokens.md §13): no grid control may swallow TAB. Native
   Tab already moves between plain inputs, but a control whose keyboard focus is
   trapped inside a PORTAL popup (an auto-focused search box + its option buttons,
   rendered at document.body end) breaks that — Tab there cycles the popup's
   buttons instead of leaving the cell.

   focusAdjacentCell moves focus to the next / previous real grid cell relative to
   an anchor element (the cell's trigger), skipping anything inside a dropdown
   portal (marked data-lp-dropdown). Callers preventDefault the Tab and call this
   so Tab ALWAYS exits the cell, popup or not.
   ============================================ */

const FOCUSABLE = 'input, button, select, textarea, a[href], [tabindex]:not([tabindex="-1"])';

/** Focus the next (dir=1) / previous (dir=-1) focusable cell after `anchor`,
 *  skipping disabled, hidden, and dropdown-portal elements. */
export function focusAdjacentCell(anchor: HTMLElement | null | undefined, dir: 1 | -1): void {
  if (!anchor || typeof document === 'undefined') return;
  const all = Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => {
    if (el.hasAttribute('disabled')) return false;
    if (el.getAttribute('aria-hidden') === 'true') return false;
    // Skip elements inside a dropdown portal — they must never be a Tab target.
    if (el.closest('[data-lp-dropdown]')) return false;
    // offsetParent is null for display:none / detached; keep sticky/fixed cells
    // (which can have a null offsetParent) by also accepting a non-zero rect.
    if (el.offsetParent === null) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return false;
    }
    return true;
  });
  const i = all.indexOf(anchor);
  if (i === -1) return;
  const next = all[i + dir];
  if (next) next.focus();
}

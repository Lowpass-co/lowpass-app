/* ============================================
   LOWPASS — ⌘↵ / Ctrl+↵ presses the form's OK (Nov 2026, Adam: "any
   okay / save / accept button after entering data should be closable with
   cmd+enter").

   One rule for the whole app, mounted once (<SubmitShortcut> in the root
   layout), so no form has to remember it. From the focused field:

     1. inside a <form>            → its submit button (requestSubmit, so
                                     validation and onSubmit run as normal);
     2. inside a dialog / slide-over (role="dialog") or a block marked
        `data-submit-scope`        → its primary button.

   Anywhere else (a search box, the grid, the page body) it does nothing —
   ⌘↵ must never fire a page's big orange button from a filter field.

   "Primary", in order: `data-submit` (explicit), `type="submit"`,
   <Button variant="primary"> (`data-variant`), then the orange button —
   the app's rule is ONE orange button per view. It acts only when exactly
   one button wins its rung; two candidates = ambiguous = nothing happens.
   Disabled and hidden buttons never count.
   ============================================ */

const SCOPE = 'form, [role="dialog"], [data-submit-scope]';

function visible(el: HTMLElement): boolean {
  if (el.hidden || el.closest('[hidden], [aria-hidden="true"]')) return false;
  // Browsers: checkVisibility() catches display:none / visibility:hidden up
  // the tree. Without it (jsdom), the attribute checks above are all we have.
  const cv = (el as HTMLElement & { checkVisibility?: (o?: object) => boolean }).checkVisibility;
  return typeof cv === 'function' ? cv.call(el, { visibilityProperty: true }) : true;
}

function enabled(b: HTMLElement): boolean {
  if ((b as HTMLButtonElement).disabled) return false;
  if (b.getAttribute('aria-disabled') === 'true') return false;
  return visible(b);
}

let orangeCache: string | null = null;
/** The resolved orange, as the browser writes background colours. */
function orange(): string | null {
  if (orangeCache !== null) return orangeCache || null;
  if (typeof document === 'undefined') return null;
  const probe = document.createElement('span');
  probe.style.background = 'var(--color-lp-orange)';
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  document.body.appendChild(probe);
  orangeCache = getComputedStyle(probe).backgroundColor || '';
  probe.remove();
  // An unresolved var reads as transparent — no orange to match.
  if (!orangeCache || /rgba\(0, 0, 0, 0\)|transparent/.test(orangeCache)) orangeCache = '';
  return orangeCache || null;
}

/** Test seam: forget the cached orange (tests set the CSS var themselves). */
export function _resetOrangeForTests(): void {
  orangeCache = null;
}

function single<T>(list: T[]): T | null {
  return list.length === 1 ? list[0]! : null;
}

/** The primary button of `scope`, or null when there's none or it's ambiguous. */
export function primaryButtonIn(scope: Element): HTMLElement | null {
  const buttons = [...scope.querySelectorAll<HTMLElement>('button, [role="button"], input[type="submit"]')].filter(
    // a button in a NESTED scope belongs to that scope, not this one
    (b) => b.closest(SCOPE) === scope || (scope.matches('form') && b.closest('form') === scope),
  );
  const live = buttons.filter(enabled);
  const rungs: Array<(b: HTMLElement) => boolean> = [
    (b) => b.hasAttribute('data-submit'),
    // The ATTRIBUTE, not the property: a <button> with no type reports
    // type "submit", so every Cancel would count.
    (b) => b.getAttribute('type') === 'submit',
    (b) => b.getAttribute('data-variant') === 'primary',
    (b) => {
      const o = orange();
      return !!o && getComputedStyle(b).backgroundColor === o;
    },
  ];
  for (const rung of rungs) {
    const hits = live.filter(rung);
    if (hits.length) return single(hits);
  }
  return null;
}

/** What ⌘↵ should press for focus at `from`, or null. */
export function submitTargetFor(from: Element | null): HTMLElement | null {
  if (!from) return null;
  // Grids own their keyboard (Enter / Tab / arrows); never reach past them.
  if (from.closest('[role="grid"], .lp-grid')) return null;
  const scope = from.closest(SCOPE);
  if (!scope) return null;
  return primaryButtonIn(scope);
}

/** The keydown rule. Returns true when it pressed something. */
export function handleSubmitShortcut(e: KeyboardEvent): boolean {
  if (e.key !== 'Enter' || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return false;
  if (e.defaultPrevented || e.isComposing) return false;
  const from = (document.activeElement as Element | null) ?? (e.target as Element | null);
  const target = submitTargetFor(from);
  if (!target) {
    // A form with no single primary button: submit it the way Enter in a
    // field would (its onSubmit decides).
    const form = from && !from.closest('[role="grid"], .lp-grid') ? from.closest('form') : null;
    if (form && form.closest(SCOPE) === form && typeof form.requestSubmit === 'function') {
      e.preventDefault();
      form.requestSubmit();
      return true;
    }
    return false;
  }
  e.preventDefault();
  const form = target.closest('form');
  if (form && (target as HTMLButtonElement).type === 'submit' && typeof form.requestSubmit === 'function') {
    form.requestSubmit(target as HTMLButtonElement);
  } else {
    target.click();
  }
  return true;
}

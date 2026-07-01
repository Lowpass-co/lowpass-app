# CC — Export PDF render FAILS ("PDF cannot be generated"). Fix. Branch off `feat/export-rooming`.

Adam hit it live: the budget/rooming export → **"PDF cannot be generated."** The route errors (the client
shows that generic message on a non-PDF response). **This is NOT a puppeteer-infra problem** — the
rider-pack PDF route (`src/app/api/rider-packs/[id]/pdf/route.ts`) uses the **same `getBrowser()` +
`@sparticuz/chromium` + `maxDuration=60`** and renders fine in production. So the bug is in **what the export
route does differently** from the working rider route.

Branch off `feat/export-rooming` (the tip of the export stack) so the fix covers Budget + Rooming +
`shell.ts` at once. Branch `fix/export-pdf-render`.

## Find it — reproduce, don't code-read
1. **Render an actual PDF in dev** (you CAN — set `PUPPETEER_EXECUTABLE_PATH` to local Chrome, hit
   `POST /api/budget/[tourId]/export/pdf?scope=both` on a seeded tour). The static floor passed; the
   *render* is what's broken, so a code-read won't find it. Get the **actual server-side exception** (it's
   swallowed into the client's generic message — log it / read it).
2. **Diff against the working rider route.** Likely suspects, in order:
   - **`page.pdf()` options** — the export uses `displayHeaderFooter: true` + a `footerTemplate` (for the
     Lowpass footer + page numbers). If `displayHeaderFooter` is on but the header/footer templates are
     malformed, or the page `margin` doesn't leave room, Chromium throws or renders blank. The rider route
     does NOT use footerTemplate (compare exactly). Fix the template (valid minimal HTML, inline styles,
     the required `margin` top/bottom to fit the footer) or fall back to in-document footer if it's fighting
     Chromium.
   - **`setContent` waitUntil** — the rider route uses `waitUntil: 'load', timeout: 15_000`. If the export
     uses `networkidle0/2` (puppeteer-core disallows those on `setContent`) it throws. Match the rider's
     `'load'`.
   - **The base64 logo data-URI** — a huge/невalid data-URI in the `<img>` can stall `setContent`. Confirm
     `fetchLogoDataUri` returns a valid `data:image/...;base64,…` (and that the initials fallback path is
     taken cleanly when no logo).
   - **A throw in `loadBudgetExportData` / `loadRoomingExportData`** — if the loader throws (a null
     relation, a missing fx rate), the route 500s before puppeteer even runs. Wrap + surface the real error.
3. **Confirm the real fix by rendering a real PDF** — open it, see the branded A4 with the P&L. Do this for
   **both** the budget route and the rooming route (shared shell/footer → if one was the footer bug, both
   were broken).

## Fix scope
- Make the export route(s) **render a valid PDF**. The fix is almost certainly in `shell.ts` (the
  footer/`page.pdf` options it sets) and/or the route's `setContent`/`page.pdf` call — fix it in the
  **shared** path so Budget, Rooming, and the future Payroll/Routing all inherit it.
- Surface real errors: the route should log the actual exception server-side (no PII — it's a budget, fine
  to log the error type) and return a 500 with a useful message, not a silent failure.

## Hard rules
- **Branch off `feat/export-rooming`. Commit + PUSH. Confirm `git log origin/<branch>`.**
- Don't change what's already verified (the P&L reconciliation, the data loaders' output, the scope toggle,
  the retired jspdf summary) — this is a **render/options** fix, not a content change.
- Don't touch the working rider/pdf-render routes.
- Tokens; `next build --webpack`; `tsc` 0; `eslint` 0.
- **VERIFY BY ACTUALLY RENDERING A PDF** — this is the whole point; a green build that doesn't render is
  exactly the failure we're fixing. Paste what the exception was + confirm a real PDF opened. Name the
  file/line that was wrong.

# CC — Export still 500s — it's PRE-RENDER + the guard isn't catching it. Branch off `fix/export-pdf-render`.

The export PDF route still 500s in production. **Claude tested it live and pinned the shape:**
- **Universal** — every tour 500s (Simple Plan AND Warning Support), so it's the route code, not data.
- **Fast — 595–1105 ms.** Chromium cold-start is 3–5 s, so **the function dies BEFORE puppeteer launches**.
  This is **not** the render, not a timeout, not OOM. It's a throw in the **pre-render setup**:
  auth → workspace-RLS check → `loadBudgetExportData` → `buildBudgetBodyHtml` (all run before `getBrowser()`).
- **Empty 500 body, no `x-vercel-error`.** So it's an app-level throw, and **`render.ts`'s error-surfacing
  is NOT catching it** — we should have gotten `{error, detail}`; we got 0 bytes. The throw escapes the guard.

The render itself is proven good (you rendered real PDFs locally). **Do not chase the render.** Two fixes:

## 1. Make the guard TOTAL (so the error can never be silent again)
The current guard doesn't wrap the throwing line. Wrap the **entire route handler** — auth, `await params`,
the workspace/RLS check, the loaders, the HTML build, AND the render — in one try/catch that **always returns
`NextResponse.json({ error, detail, stack }, { status: 500 })`**. A failing export must return a **JSON body
with the real message**, never a bare empty 500. Do this for **both** the budget and rooming routes (shared
helper). **Verify: trigger a failing export → the response body is JSON with the error, not 0 bytes.** This
alone unblocks us — once the error surfaces, Claude reads it off the client in one step.

## 2. Find the pre-render throw (it's a narrow target)
It dies in <1.1 s before puppeteer, universally. So it's in **`loadBudgetExportData`** /
**`buildBudgetBodyHtml`** / the route's auth+RLS — audit those for a sync throw or a rejecting await
(a null deref, a missing `await`, a wrong column/relation, an undefined the build indexes into).
- **Key clue:** the budget **page itself loads fine** (the Summary tab renders), so the data EXISTS and the
  page's loaders work. `loadBudgetExportData` "mirrors" them but is a separate code path — it's doing
  something the page's loaders don't, and that's the throw. **Diff `loadBudgetExportData` against the actual
  page loaders in `budget/[tourId]/page.tsx`** line by line.
- Reproduce `loadBudgetExportData(tourId)` in isolation (a node script against a seeded tour, or a unit
  test) so you can SEE the throw — don't code-read past it.

## Hard rules
- **Branch off `fix/export-pdf-render`. Commit + PUSH. Confirm `git log origin/<branch>`.**
- Don't touch the render (`page.pdf`, `shell.ts`, `getBrowser`) — proven good. This is the **pre-render
  path + the guard**.
- Don't change the data/reconciliation output — if the loader is throwing, fix WHY it throws, don't paper
  over it with defaults that change the numbers.
- Tokens; `next build --webpack`; `tsc` 0; `eslint` 0.
- **Verify before claiming:** (a) a failing export returns a JSON error body (not 0 bytes) — this is
  mandatory; (b) if you find + fix the throw, render a real PDF to confirm. Paste the actual exception you
  found.

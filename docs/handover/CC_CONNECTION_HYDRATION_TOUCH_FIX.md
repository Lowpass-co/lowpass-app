# CC — Hardening fix: hydration mismatch + spurious "Offline" + /touch 503 + post-rollback resolve race. Branch off `main`.

Surfaced during the B2 rollback live-verify. Three small, mostly-independent defects. **Root cause of the
big one is found** — name files/lines, fix, push, confirm `git log origin/<branch>`.

## 1. (Primary) #418 hydration mismatch + the false "Offline" flash — `ConnectionIndicator.tsx`
**Root cause:** `src/components/realtime/ConnectionIndicator.tsx:62-63` seeds initial state from a
browser-only API **during render**:
```ts
const [online, setOnline] = useState<boolean>(() =>
  typeof navigator === 'undefined' ? true : navigator.onLine);
```
The server renders with `navigator === undefined` → `true` ("Live"). The client hydrates reading the
real `navigator.onLine`; when that's `false` (or flapping) at first paint, server HTML ("Live") ≠ client
("Offline") → **React #418 hydration error**, plus a spurious "Offline — refresh to reconnect" banner and
knock-on first-paint weirdness (panels that look stuck until React recovers).

**Fix (standard SSR pattern):** never read `navigator.onLine` during the initial render. Seed the state
to a **stable** value identical on server + client (use `'connecting'`/`true` — the existing 600ms
bridge already covers the real reading), then read `navigator.onLine` **in a `useEffect` after mount**
and update. The first client render must match the server render exactly. (A `mounted` gate or moving the
read entirely into the existing `useEffect` both work; don't paper over it with `suppressHydrationWarning`
on dynamic text — fix the state seed.) Verify the #418 is gone from the console on a cold budget load and
the pill shows Live without an Offline flash.

## 2. (Secondary) `/api/tours/[id]/touch` returns 503 on every tour load
`src/app/api/tours/[id]/touch/route.ts`. The client (`src/components/shell-v2/TourVisitTracker.tsx`) is
already correctly fire-and-forget (`.catch(()=>{})`), so this **doesn't gate the UI** — but it 503s on
every page load (the route's own code only returns 500/204/401, so the 503 is the **function crashing or
timing out**, not a caught error). It pollutes logs and the network tab.
**Fix:** make a best-effort telemetry ping incapable of erroring the function — wrap the whole handler so
it **always returns 204**, even on auth failure / DB error / exception (log server-side, never throw).
Then investigate the crash/timeout: confirm the `tours` UPDATE isn't hanging (lock / RLS cost) and that
`last_visited_at` resolves (migration 069 — column exists). If you can't pin the 503 without prod logs,
the always-204 guard is the correctness fix; note what you found.

## 3. (Tertiary) Post-rollback resolve race — rolled-back version briefly editable
Right after a rollback, **before realtime reconnects / a refresh**, the just-rolled-back version can
momentarily resolve as the **editable draft** in the grid (observed: a `rolled_back` v2 showed an editable
`est` cell for a beat). It self-corrects on reload and the DB immutability trigger would reject any write,
so it's **cosmetic, not a data risk** — but fix it so the resolver is deterministic.
**Where:** `src/server/budget/versions.ts` (`resolveActiveVersion` / the head computation) +
`src/app/(app)/budget/[tourId]/page.tsx` + `src/components/budget/versioning/VersionSelector.tsx`
(`headId`). B1's note says these already "exclude `rolled_back`" from the head — there's a hole when a
version is **actively selected** right after the mutation. Ensure `versionLocked` for the viewed version
is derived **purely from the fetched version's `status`** (`status !== 'draft'` → locked), not from any
"is this the head" inference that can transiently mis-resolve. A `rolled_back` (or `superseded`/`approved`)
version must be read-only on the very first render after selection, no realtime dependency.

## Hard rules
- **Branch off `main`. Commit + PUSH. Confirm `git log origin/<branch>` has the commit before reporting.**
- Don't regress B1/B2 versioning (the `viewed` threading, the lock modal, the rollback RPC/flow, the
  one-approved index) or the income phases. #1 and #3 touch render/resolve logic — keep the lock
  predicate `status !== 'draft'`.
- Tokens; `next build --webpack`; `tsc` 0; `eslint` 0.
- **Verify before claiming** — #1: no #418 in console on cold load, no Offline flash; #2: `/touch` returns
  204 in the network tab (never 503); #3: select a rolled-back version immediately after a rollback → it's
  read-only on first render. Name files/lines; push the hash.

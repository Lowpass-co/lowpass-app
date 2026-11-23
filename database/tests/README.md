# Database tests (PGlite)

Real Postgres (PGlite, in-process) with a minimal Supabase shape: roles,
`auth.uid()` from `request.jwt.claim.sub`, `storage.objects`. Each test pastes
the migration exactly as Adam would, re-pastes it (must be a no-op), then
checks what each kind of user can read and write.

    npm i --no-save @electric-sql/pglite@0.2.17
    node database/tests/292_tour_access.test.mjs
    node database/tests/293_tour_access_rules.test.mjs
    node database/tests/295_admin_delete.test.mjs
    node database/tests/297_change_tour_currency.test.mjs

Run from the repo root. Not part of `vitest` (PGlite is not a dependency).

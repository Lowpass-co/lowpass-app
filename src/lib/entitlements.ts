/* ============================================
   LOWPASS — Product Split Phase 1 — Entitlements scaffold

   Hook returning which of the four products the current user can
   access. Phase 1 hardcodes everything to true. When Stripe lands,
   this hook reads from the `subscriptions` / `entitlements` table.

   Usage (rail / nav / route guards):
     const flags = useEntitlements();
     if (!flags.budget) return null;

   The hook is intentionally usable from both client and server
   components — it just returns a constant object. Future versions
   that read auth state will need a server-only variant if they pull
   from a request-scoped Supabase client.
   ============================================ */

export interface Entitlements {
  home: boolean;
  operations: boolean;
  budget: boolean;
  advance: boolean;
}

const HARDCODED_ALL_TRUE: Readonly<Entitlements> = Object.freeze({
  home: true,
  operations: true,
  budget: true,
  advance: true,
});

/**
 * Returns the current user's product entitlements.
 *
 * Phase 1: hardcoded all-true. Swap this to read from Supabase /
 * Stripe when entitlements ship — every rail item, route guard, and
 * nav surface already calls through here.
 */
export function useEntitlements(): Entitlements {
  return HARDCODED_ALL_TRUE;
}

/** Server-side equivalent. Same signature, no React hook semantics —
 *  call from server components / route handlers. */
export function getEntitlements(): Entitlements {
  return HARDCODED_ALL_TRUE;
}

/** Map a Postgres/RPC error code to an HTTP status for the version transitions.
 *  42501 = insufficient_privilege (approver gate) → 403;
 *  23505 = unique_violation (concurrent double-approve hits the one-approved
 *          partial unique index) → 409; everything else (raise_exception P0001
 *          "not found" / "no approved version" etc.) → 400. */
export function rpcErrorStatus(code: string | undefined): number {
  if (code === '42501') return 403;
  if (code === '23505') return 409;
  return 400;
}

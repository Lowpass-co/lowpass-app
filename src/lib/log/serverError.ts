/* ============================================
   LOWPASS — server-side error logger (P0 budget hardening)

   There is no Sentry/logging dep in the project (yet), so this is a thin
   `console.error` wrapper — Vercel captures function-log output, so the real
   stack still lands somewhere we can read it.

   The point is to DEGRADE-BUT-NOT-SWALLOW: callers that catch an error to
   return a safe default MUST call this so the underlying cause is still
   recorded (and the next reader can fix the true root, not just the symptom).
   ============================================ */

export function logServerError(
  context: string,
  err: unknown,
  meta?: Record<string, unknown>,
): void {
  const detail = err instanceof Error ? (err.stack ?? err.message) : err;
  console.error(`[lp] ${context}`, { err: detail, ...(meta ?? {}) });
  // Future: Sentry.captureException(err, { tags: { context }, extra: meta });
}

/* ============================================
   LOWPASS — AI usage report types + display helpers (§AI-4)

   Client-safe module: pure types + formatUsd, with NO import of
   the service-role / next-headers server client. The server data
   access (getAiUsageReport) lives in usage-report.ts and re-
   exports these. Client components (AiUsageDashboard /
   AiUsageFilters) import from HERE so the server module never
   leaks into the client bundle.
   ============================================ */

export interface AiUsageByUser {
  userId: string | null;
  label: string;
  calls: number;
  tokens: number;
  micros: number;
  pctOfTotal: number;
}

export interface AiUsageByEndpoint {
  endpoint: string;
  calls: number;
  avgMicros: number;
  micros: number;
}

export interface AiUsageByDay {
  date: string;
  micros: number;
}

export interface AiUsageRecentRow {
  id: string;
  createdAt: string;
  userLabel: string;
  endpoint: string;
  model: string;
  tokens: number;
  micros: number;
  status: string;
}

export interface AiUsageReport {
  totalThisMonthMicros: number;
  totalLastMonthMicros: number;
  topUser: { userId: string | null; label: string; micros: number } | null;
  topEndpoint: { endpoint: string; micros: number } | null;
  byUser: AiUsageByUser[];
  byEndpoint: AiUsageByEndpoint[];
  byDay: AiUsageByDay[];
  recent: AiUsageRecentRow[];
  workspaces: { id: string; name: string }[];
}

export interface GetAiUsageReportOpts {
  workspaceId: string | null;
  monthStartIso: string;
  prevMonthStartIso: string;
}

/** Micro-USD → "$X.XX" (or 4 decimals when < $1) for display. */
export function formatUsd(micros: number): string {
  const safe = Number.isFinite(micros) ? micros : 0;
  return `$${(safe / 1_000_000).toFixed(Math.abs(safe) < 1_000_000 ? 4 : 2)}`;
}

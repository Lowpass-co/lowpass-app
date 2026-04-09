/** Validates workspace-scoped artist UUID from URL/search params. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseWorkspaceArtistId(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string' || !UUID_RE.test(raw)) return null;
  return raw;
}

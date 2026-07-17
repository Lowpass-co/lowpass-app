/* ============================================
   LOWPASS — Rider pack row view-model + server transform

   Pure, server-safe helpers extracted from RiderPacksTourClient.tsx
   (a 'use client' module). Server components — the Operations Riders
   page and the legacy /tours/[id]/rider-packs page — call
   riderPackRowsFromServer() directly; Next 16 forbids invoking a
   function exported from a 'use client' module from the server, which
   is the "riderPackRowsFromServer is on the client" crash this fixes.
   ============================================ */

export type RiderPackRowVm = {
  id: string;
  title: string | null;
  status: 'draft' | 'sent' | 'signed';
  recipientLabel: string;
  artistName: string;
  scope: string;
  lastSentRelative: string;
  updatedRelative: string;
  updatedIso: string;
};

function formatRelative(iso: string): string {
  try {
    const d = new Date(iso);
    const delta = Date.now() - d.getTime();
    const mins = Math.floor(delta / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 48) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  } catch {
    return iso;
  }
}

export function riderPackRowsFromServer(
  packs: Array<{
    id: string;
    artist_id?: string;
    title: string | null;
    scope: string;
    updated_at: string;
    artists?: { name: string | null } | null;
    rider_pack_exports?: Array<{ exported_at: string; export_type: string }> | null;
  }>,
  artistFallback: Map<string, string>,
): RiderPackRowVm[] {
  return packs.map((p) => {
    const exports = [...(p.rider_pack_exports ?? [])].sort(
      (a, b) => new Date(b.exported_at).getTime() - new Date(a.exported_at).getTime(),
    );
    const latest = exports[0];
    let status: RiderPackRowVm['status'] = 'draft';
    if (latest) {
      if (latest.export_type === 'web_link') status = 'signed';
      else if (latest.export_type === 'google_doc') status = 'sent';
    }
    const artistId = (p as { artist_id?: string }).artist_id;
    const artistName =
      (p.artists as { name?: string | null } | undefined)?.name ??
      (artistId ? artistFallback.get(artistId) : undefined) ??
      'Artist';
    const recipientLabel =
      p.scope === 'show'
        ? 'Production / show-level'
        : p.scope === 'tour'
          ? `${artistName} (tour)`
          : `${artistName} (artist)`;
    const lastSent = exports.reduce<string | null>(
      (acc, e) =>
        acc == null || new Date(e.exported_at).getTime() > new Date(acc).getTime() ? e.exported_at : acc,
      null,
    );
    return {
      id: p.id,
      title: p.title,
      status,
      recipientLabel,
      artistName,
      scope: p.scope,
      // LT-02 (G1-B #18) — "never sent" reads clearer than a bare em-dash.
      lastSentRelative: lastSent ? formatRelative(lastSent) : 'never sent',
      updatedRelative: formatRelative(p.updated_at),
      updatedIso: p.updated_at,
    };
  });
}

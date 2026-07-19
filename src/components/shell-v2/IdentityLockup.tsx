/* ============================================
   LOWPASS — <IdentityLockup> (G2-4, the ONE artist/tour lockup)

   avatar · artist · condensed tour · status — the single identity band rendered
   above the section tabs on every grouped tour surface (Operations, Budget,
   Advance). One component, one size, one position — no per-page variants. This is
   purely presentational; layouts load the fields via loadTourIdentity and decide
   when to render it.
   ============================================ */

const STATUS_TONE: Record<string, { fg: string; bg: string }> = {
  on_tour: { fg: 'var(--color-lp-day-show)', bg: 'color-mix(in srgb, var(--color-lp-day-show) 14%, transparent)' },
  upcoming: { fg: 'var(--color-lp-orange)', bg: '#FF45001a' },
  planning: { fg: 'var(--lp-text-secondary)', bg: 'var(--lp-surface-muted, rgba(120,120,120,0.14))' },
  ended: { fg: 'var(--lp-text-tertiary)', bg: 'var(--lp-surface-muted, rgba(120,120,120,0.12))' },
};

export function IdentityLockup({
  artistName,
  avatarUrl,
  tourName,
  statusLabel,
  statusKey,
}: {
  artistName: string;
  avatarUrl: string | null;
  tourName: string;
  statusLabel: string;
  statusKey: string;
}) {
  const tone = STATUS_TONE[statusKey] ?? STATUS_TONE.planning;
  const initials = (artistName || '?').trim().slice(0, 1).toUpperCase();
  return (
    <div
      className="flex shrink-0 items-center gap-3"
      style={{ background: 'var(--lp-panel)', padding: 'var(--lp-space-2) var(--lp-space-4)', borderBottom: '1px solid var(--lp-border-subtle)' }}
    >
      <span
        aria-hidden
        style={{
          width: 26, height: 26, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: avatarUrl ? undefined : 'var(--lp-surface-muted, #374151)',
          color: 'var(--lp-text-secondary)', fontSize: 11, fontWeight: 700,
          border: '1px solid var(--lp-border-subtle)',
        }}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" width={26} height={26} style={{ width: 26, height: 26, objectFit: 'cover' }} />
        ) : (
          initials
        )}
      </span>
      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--lp-text)', whiteSpace: 'nowrap' }}>{artistName || 'Artist'}</span>
      <span aria-hidden style={{ color: 'var(--lp-text-tertiary)' }}>·</span>
      <span style={{ fontSize: 13, color: 'var(--lp-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 320 }}>{tourName || 'Tour'}</span>
      {statusLabel ? (
        <span
          style={{
            marginLeft: 4, display: 'inline-flex', alignItems: 'center', gap: 5,
            fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 'var(--lp-radius-full)',
            color: tone.fg, background: tone.bg, whiteSpace: 'nowrap',
          }}
        >
          <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: tone.fg }} />
          {statusLabel}
        </span>
      ) : null}
    </div>
  );
}

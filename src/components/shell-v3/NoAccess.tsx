/* Shown in place of a page the viewer's access doesn't cover (AppShellV3). */
export function NoAccess() {
  return (
    <div style={{ padding: 'var(--lp-space-8)', maxWidth: 520 }}>
      <h1 className="lp-page-title">Not on your access</h1>
      <p style={{ marginTop: 'var(--lp-space-3)', color: 'var(--lp-text-secondary)', fontSize: 'var(--lp-text-sm)', lineHeight: 1.5 }}>
        This part of the tour isn&apos;t shared with you. If you need it, ask the tour&apos;s admin to add it on Team &amp; roles.
      </p>
    </div>
  );
}

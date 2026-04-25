export type SavePillState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export function SaveStatePill({
  state,
  error,
}: {
  state: SavePillState;
  error: string | null;
}) {
  if (state === 'idle') return null;
  const config = {
    pending: { label: 'Unsaved changes', color: 'var(--lp-text-tertiary)' },
    saving: { label: 'Saving…', color: 'var(--lp-text-secondary)' },
    saved: { label: 'Saved', color: 'var(--lp-orange)' },
    error: { label: error || 'Save failed', color: 'var(--lp-error)' },
  }[state];
  return (
    <span
      title={state === 'error' && error ? error : undefined}
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
      style={{
        color: config.color,
        border: `1px solid ${config.color}`,
        backgroundColor: 'transparent',
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: config.color }} />
      {config.label}
    </span>
  );
}

'use client';

type Props = {
  sectionCount: number;
  fieldCount: number;
  updatedAt: string | null;
  exportStatus: 'never' | 'exported';
  shareLinkCount: number;
};

export function PackStatCards({
  sectionCount,
  fieldCount,
  updatedAt,
  exportStatus,
  shareLinkCount,
}: Props) {
  const cards = [
    { label: 'Sections', value: String(sectionCount), color: 'var(--lp-text)' },
    { label: 'Fields', value: String(fieldCount), color: 'var(--lp-text)' },
    {
      label: 'Last edit',
      value: updatedAt ? formatRelative(updatedAt) : '—',
      color: 'var(--lp-text-secondary)',
    },
    {
      label: 'Google Doc',
      value: exportStatus === 'exported' ? 'Exported' : 'Not exported',
      color:
        exportStatus === 'exported' ? 'var(--lp-orange)' : 'var(--lp-text-tertiary)',
    },
    {
      label: 'Share links',
      value: String(shareLinkCount),
      color: 'var(--lp-text)',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-xl px-4 py-3"
          style={{
            backgroundColor: 'var(--lp-surface)',
            border: '1px solid var(--lp-border)',
          }}
        >
          <div
            className="text-[11px] font-bold uppercase tracking-wider"
            style={{ color: 'var(--lp-text-tertiary)' }}
          >
            {c.label}
          </div>
          <div className="text-2xl font-bold" style={{ color: c.color }}>
            {c.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '—';
  const diff = Date.now() - then;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

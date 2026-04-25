'use client';

import { useCallback, useEffect, useState } from 'react';
import { listWebLinks, type WebLink } from '@/lib/rider-packs/client';
import { formatRelativeTime } from '@/lib/format-relative';
import type { ResolvedSection } from '@/lib/rider-packs/types';

type Props = {
  packId: string;
  packUpdatedAt: string;
  sections: ResolvedSection[];
  onShareClick: () => void;
};

function StatCard({
  label,
  value,
  caption,
  onClick,
  clickable,
}: {
  label: string;
  value: string;
  caption?: string;
  onClick?: () => void;
  clickable?: boolean;
}) {
  return (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (clickable && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick?.();
        }
      }}
      className={`rounded-xl px-4 py-3 bg-lp-surface border border-lp-border ${clickable ? 'cursor-pointer transition-colors hover:bg-lp-surface-hover' : ''}`}
    >
      <div className="text-xs text-lp-text-tertiary uppercase tracking-wide">{label}</div>
      <div className="mt-1 text-lg font-semibold text-lp-text">{value}</div>
      {caption && <div className="mt-0.5 text-xs text-lp-text-secondary">{caption}</div>}
    </div>
  );
}

/** Count sections by kind for caption; all current packs are field sections until R10 adds section_type. */
export function formatSectionBreakdown(sections: ResolvedSection[]): string {
  const n = sections.length;
  if (n === 0) return 'No sections yet';
  // When section_type exists on rows, extend to count 'fields' | 'channel_list' | 'attachments' etc.
  return `${n} — ${n} field ${n === 1 ? 'section' : 'sections'}`;
}

export function PackStatCards({ packId, packUpdatedAt, sections, onShareClick }: Props) {
  const [links, setLinks] = useState<WebLink[] | null>(null);
  const refreshLinks = useCallback(async () => {
    try {
      const res = await listWebLinks(packId);
      setLinks(res.links);
    } catch {
      setLinks(null);
    }
  }, [packId]);

  useEffect(() => {
    void refreshLinks();
  }, [refreshLinks]);

  const active = (links ?? []).filter((l) => !l.revoked_at);
  // TODO(R15): open counts from analytics
  const shareCaption =
    links === null
      ? '—'
      : active.length === 0
        ? 'No share links'
        : `${active.length} link${active.length !== 1 ? 's' : ''} · opens —`;

  return (
    <div className="mb-6 flex flex-wrap gap-3">
      <StatCard
        label="Last edit"
        value={formatRelativeTime(packUpdatedAt)}
        caption={new Date(packUpdatedAt).toLocaleString()}
      />
      <StatCard label="Sections" value={String(sections.length)} caption={formatSectionBreakdown(sections)} />
      <StatCard
        label="Share links"
        value={active.length > 0 ? String(active.length) : '0'}
        caption={shareCaption}
        clickable
        onClick={onShareClick}
      />
    </div>
  );
}

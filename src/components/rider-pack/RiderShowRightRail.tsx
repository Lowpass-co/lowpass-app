/* ============================================
   LOWPASS — Rider · Show Right Rail (§RA10)

   ~280px right rail companion to RiderShowReadView in show mode. Ports
   the RailCard chrome from src/components/advance/AdvanceShowRightRail.tsx
   :197-227 (rounded bordered card + uppercase tertiary title).

   Rider adaptation (data-shape): Advance's rail is venue specs / key
   contacts / previously-played — all show+venue context a rider doesn't
   have. The rider equivalent is a SECTION NAVIGATOR: each section as a
   jump link (#rider-section-<id>, anchored by RiderShowReadView) with a
   completion status dot + filled count — the "orient while filling" role.
   A small "Rider" card carries scope + template lineage.

   Status dot is color-not-only — paired with a text count ("3/5") and the
   link label, so completion isn't conveyed by colour alone.
   ============================================ */

'use client';

import type { PackScope, RiderSection } from '@/lib/rider-packs/types';
import { sectionStatus, sectionFillCounts, type RiderSectionStatus } from '@/lib/rider-packs/progress';

const SCOPE_LABEL: Record<PackScope, string> = { artist: 'Artist', tour: 'Tour', show: 'Show' };

// Canonical status → dot colour (§RA11 shared helper drives the status).
const DOT_COLOR: Record<RiderSectionStatus, string> = {
  complete: 'var(--color-lp-status-complete)',
  in_progress: 'var(--color-lp-status-in-progress)',
  needs_review: 'var(--color-lp-status-needs-review)',
  not_started: 'var(--lp-text-tertiary)',
};

interface RiderShowRightRailProps {
  sections: RiderSection[];
  scope?: PackScope;
  scopeContext?: string | null;
  templateName?: string | null;
}

export function RiderShowRightRail({ sections, scope, scopeContext, templateName }: RiderShowRightRailProps) {
  return (
    <aside
      className="advance-read-no-print hidden shrink-0 flex-col gap-3 lg:flex"
      style={{ width: 280, borderLeft: '1px solid var(--lp-border-strong)', background: 'var(--lp-panel)', padding: 12, overflowY: 'auto' }}
    >
      <RailCard title="Sections">
        {sections.length === 0 ? (
          <p style={{ fontSize: '12px', color: 'var(--lp-text-tertiary)', fontStyle: 'italic' }}>No sections yet.</p>
        ) : (
          <ul className="flex flex-col" style={{ gap: 2 }}>
            {sections.map((s) => {
              const status = sectionStatus(s);
              const { filled, total } = sectionFillCounts(s);
              const isOther = (s.section_type ?? 'fields') !== 'fields';
              return (
                <li key={s.id}>
                  <a
                    href={`#rider-section-${s.id}`}
                    className="btn-transition flex items-center gap-2 rounded"
                    style={{ padding: '6px 6px', fontSize: '13px', color: 'var(--lp-text)', textDecoration: 'none' }}
                  >
                    <span
                      aria-hidden
                      className="shrink-0"
                      style={{ width: 8, height: 8, borderRadius: 9999, background: DOT_COLOR[status] }}
                    />
                    <span className="min-w-0 flex-1 truncate">{s.title}</span>
                    {isOther ? (
                      <span className="lp-mono shrink-0" style={{ fontSize: '10px', color: 'var(--lp-text-tertiary)' }}>—</span>
                    ) : (
                      <span className="lp-mono shrink-0" style={{ fontSize: '11px', color: 'var(--lp-text-tertiary)' }}>
                        {filled}/{total}
                      </span>
                    )}
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </RailCard>

      {scope || templateName ? (
        <RailCard title="Rider">
          <dl className="flex flex-col" style={{ gap: 8, fontSize: '12px' }}>
            {scope ? (
              <Row label="Scope" value={`${SCOPE_LABEL[scope]}${scopeContext ? ` · ${scopeContext}` : ''}`} />
            ) : null}
            {templateName ? <Row label="Template" value={templateName} /> : null}
          </dl>
        </RailCard>
      ) : null}
    </aside>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt style={{ color: 'var(--lp-text-tertiary)' }}>{label}</dt>
      <dd className="min-w-0 truncate text-right" style={{ color: 'var(--lp-text)' }}>
        {value}
      </dd>
    </div>
  );
}

function RailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border p-3" style={{ borderColor: 'var(--lp-border-strong)', background: 'var(--lp-bg-deep)' }}>
      <h3
        style={{
          fontSize: '12px',
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--lp-text-tertiary)',
          marginBottom: 8,
        }}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

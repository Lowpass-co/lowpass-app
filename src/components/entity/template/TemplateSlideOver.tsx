'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import type { TemplateVm } from '@/lib/types/template-vm';
import { SlideOver } from '@/components/ui/SlideOver';
import { cn } from '@/lib/utils';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 border-b border-lp-border/70 pb-4">
      <h3 className="text-[10px] font-bold uppercase tracking-wider text-lp-text-tertiary">{title}</h3>
      {children}
    </section>
  );
}

function kindLabel(k: TemplateVm['kind']): string {
  switch (k) {
    case 'rider-pack':
      return 'Rider pack';
    case 'advance-layout':
      return 'Advance layout';
    case 'advance-schedule':
      return 'Advance schedule';
    case 'budget':
      return 'Budget';
    default:
      return 'Advance library';
  }
}

function KindPill({ kind }: { kind: TemplateVm['kind'] }) {
  return (
    <span
      className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--lp-orange) 14%, transparent)',
        color: 'var(--lp-orange)',
      }}
    >
      {kindLabel(kind)}
    </span>
  );
}

export default function TemplateSlideOver({ template, onClose }: { template: TemplateVm; onClose: () => void }) {
  const router = useRouter();

  const openEditor = () => {
    router.push(template.editorHref);
    onClose();
  };

  return (
    <SlideOver
      open
      onClose={onClose}
      title={template.name}
      headerStart={<KindPill kind={template.kind} />}
      subtitle={
        template.description ? (
          <span className="text-xs" style={{ color: 'var(--lp-text-secondary)' }}>
            {template.description}
          </span>
        ) : null
      }
      headerActions={
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md border border-lp-border px-2.5 py-1 text-xs font-medium text-lp-text'
          )}
          onClick={openEditor}
        >
          Open in editor
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </button>
      }
      width="wide"
      backdrop
      footer={
        <div className="flex justify-end">
          <button type="button" className="rounded-md border border-lp-border px-3 py-2 text-sm text-lp-text" onClick={onClose}>
            Close
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <Section title="Identity">
          <div className="text-sm">
            <p className="font-medium text-lp-text">{template.name}</p>
            {template.description ? <p className="mt-1 text-lp-text-secondary">{template.description}</p> : null}
          </div>
        </Section>

        <Section title="Usage">
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-[10px] font-bold uppercase text-lp-text-tertiary">Used count</dt>
              <dd className="text-lp-text">{template.usedCount}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase text-lp-text-tertiary">Last export / use</dt>
              <dd className="text-lp-text">
                {template.lastUsedAt
                  ? new Date(template.lastUsedAt).toLocaleString()
                  : '—'}
              </dd>
            </div>
          </dl>
          {template.kind === 'rider-pack' ? (
            <p className="mt-2 text-xs text-lp-text-tertiary">
              Rider-pack “used” counts derive from export snapshots in this workspace. Layout and schedule aggregates are best-effort
              hooks for later linkage.
            </p>
          ) : (
            <p className="mt-2 text-xs text-lp-text-tertiary">
              Usage aggregates for Advance templates will tighten when forms pin saved template IDs in shared metadata.
            </p>
          )}
        </Section>

        <Section title="Preview">
          {template.kind === 'advance-layout' || template.kind === 'advance-schedule' || template.kind === 'other' ? (
            <p className="text-sm text-lp-text-secondary">
              Structural preview lives inside the Advance editor. Jump in with <span className="font-semibold text-lp-text">Open in editor</span>.
            </p>
          ) : template.kind === 'rider-pack' ? (
            <p className="text-sm text-lp-text-secondary">
              Rider pack previews open in the full pack editor — use Open in editor to review sections inline.
            </p>
          ) : (
            <p className="text-sm text-lp-text-secondary">Budget templates aren’t wired into this catalogue yet.</p>
          )}
        </Section>

        <Section title="Activity">
          <p className="text-xs text-lp-text-secondary">
            Updated{' '}
            <time dateTime={template.updatedAt}>{new Date(template.updatedAt).toLocaleString()}</time>
          </p>
          {template.createdBy ? (
            <p className="mt-1 text-[10px] text-lp-text-tertiary">Creator: {template.createdBy.slice(0, 8)}…</p>
          ) : (
            <p className="mt-1 text-[10px] text-lp-text-tertiary">Creator metadata not tracked for this row.</p>
          )}
        </Section>
      </div>
    </SlideOver>
  );
}

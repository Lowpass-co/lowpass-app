'use client';

/* ============================================
   LOWPASS — <ArtistRidersLibrary> — /artists/[id]/riders (rebuild, Nov 2026)

   Where an artist's riders are found: each tour's Tech / Hospitality with its
   latest version (opens that tour's Riders page), and the rider templates —
   rename / delete for library editors. Riders are written on the tour; this
   page only lists and tidies.
   ============================================ */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ContextMenu } from '@/components/ui/ContextMenu';
import { Modal } from '@/components/ui/Modal';
import { PageTitle } from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { fmtDay } from '@/lib/riders/blocks';
import { RIDER_KIND_LABEL, type RiderKind } from '@/lib/riders/types';
import './riderLibrary.css';

export interface LibraryTour {
  id: string;
  name: string;
  start: string | null;
  end: string | null;
  docs: { kind: RiderKind; title: string }[];
  latest: { label: string; publishedAt: string } | null;
}

export interface LibraryTemplate {
  id: string;
  name: string;
  kind: RiderKind;
  /** Tagged with this artist (an artist-level rider brought over, or saved for them). */
  mine: boolean;
  updatedAt: string;
}

function dates(t: LibraryTour): string | null {
  if (!t.start) return null;
  if (!t.end || t.end === t.start) return fmtDay(t.start, true);
  return `${fmtDay(t.start, t.start.slice(0, 4) !== t.end.slice(0, 4))} – ${fmtDay(t.end, true)}`;
}

async function send(url: string, init: RequestInit): Promise<void> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error ?? 'Something went wrong — try again.');
  }
}

export function ArtistRidersLibrary({
  artistName,
  tours,
  templates,
  canEditTemplates,
  legacyCount,
}: {
  artistName: string;
  tours: LibraryTour[];
  templates: LibraryTemplate[];
  canEditTemplates: boolean;
  legacyCount: number;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<LibraryTemplate | null>(null);
  const [busy, setBusy] = useState(false);
  const withRiders = tours.filter((t) => t.docs.length).length;

  const run = async (fn: () => Promise<void>, done: string) => {
    setBusy(true);
    try {
      await fn();
      showToast(done, 'success');
      router.refresh();
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const bringOver = () =>
    run(async () => {
      const res = await fetch('/api/riders/bring-over', { method: 'POST' });
      const j = (await res.json().catch(() => ({}))) as { riders?: number; templates?: number; error?: string };
      if (!res.ok) throw new Error(j.error ?? 'Couldn’t bring them over — try again.');
    }, 'Old riders brought over — check each tour’s Riders page, then publish.');

  const rename = () => {
    if (!renaming) return;
    const { id, name } = renaming;
    void run(async () => {
      await send(`/api/rider-templates/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      setRenaming(null);
    }, 'Template renamed');
  };

  return (
    <div className="rdl-page">
      <header className="rdl-head">
        <div className="rdl-caps">{artistName}</div>
        <PageTitle>Riders</PageTitle>
        <div className="rdl-facts">
          {withRiders} of {tours.length} tour{tours.length === 1 ? '' : 's'} with a rider · {templates.length} template{templates.length === 1 ? '' : 's'}
        </div>
      </header>

      {legacyCount > 0 ? (
        <div className="rdl-banner">
          <span className="grow">
            {legacyCount} rider{legacyCount === 1 ? '' : 's'} from the old builder {legacyCount === 1 ? 'isn’t' : 'aren’t'} here yet.
          </span>
          <Button variant="primary" size="sm" disabled={busy} onClick={() => void bringOver()}>
            Bring them over
          </Button>
        </div>
      ) : null}

      <section className="rdl-section" aria-labelledby="rdl-tours">
        <h2 id="rdl-tours" className="rdl-h">
          Tours
        </h2>
        {tours.length ? (
          <ul className="rdl-panel">
            {tours.map((t) => (
              <li key={t.id} className="rdl-row">
                <Link className="rdl-main" href={`/operations/${t.id}/riders`}>
                  <span className="rdl-name">{t.name}</span>
                  <span className="rdl-sub">
                    {[dates(t), t.latest ? `Version ${t.latest.label} · ${fmtDay(t.latest.publishedAt.slice(0, 10), true)}` : t.docs.length ? 'Not published yet' : 'No rider yet'].filter(Boolean).join(' · ')}
                  </span>
                </Link>
                <span className="rdl-docs">
                  {t.docs.map((d) => (
                    <Link key={d.kind} className="rdl-chip" href={`/operations/${t.id}/riders?doc=${d.kind}`} title={d.title}>
                      {RIDER_KIND_LABEL[d.kind]}
                    </Link>
                  ))}
                </span>
                <ChevronRight size={16} className="rdl-chev" aria-hidden />
              </li>
            ))}
          </ul>
        ) : (
          <p className="rdl-empty">No tours for {artistName} yet. A rider is written on a tour, under Production › Riders.</p>
        )}
      </section>

      <section className="rdl-section" aria-labelledby="rdl-templates">
        <h2 id="rdl-templates" className="rdl-h">
          Templates
        </h2>
        {templates.length ? (
          <ul className="rdl-panel">
            {templates.map((t) => (
              <li key={t.id} className="rdl-row">
                {renaming?.id === t.id ? (
                  <form
                    className="rdl-rename"
                    data-submit-scope
                    onSubmit={(e) => {
                      e.preventDefault();
                      rename();
                    }}
                  >
                    <input
                      autoFocus
                      aria-label="Template name"
                      value={renaming.name}
                      maxLength={120}
                      onChange={(e) => setRenaming({ id: t.id, name: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setRenaming(null);
                      }}
                    />
                    <Button type="submit" variant="primary" size="sm" disabled={busy || !renaming.name.trim()}>
                      Save
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setRenaming(null)}>
                      Cancel
                    </Button>
                  </form>
                ) : (
                  <>
                    <span className="rdl-main">
                      <span className="rdl-name">{t.name}</span>
                      <span className="rdl-sub">
                        {RIDER_KIND_LABEL[t.kind]} · saved {fmtDay(t.updatedAt.slice(0, 10), true)}
                        {t.mine ? ` · ${artistName}` : ''}
                      </span>
                    </span>
                    {canEditTemplates ? (
                      <ContextMenu
                        items={[
                          { label: 'Rename', icon: Pencil, onClick: () => setRenaming({ id: t.id, name: t.name }) },
                          { label: 'Delete', icon: Trash2, variant: 'danger', onClick: () => setDeleting(t) },
                        ]}
                      />
                    ) : null}
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="rdl-empty">No rider templates yet. On a tour’s Riders page, ⋯ › Save as template — then any tour can start from it.</p>
        )}
      </section>

      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete this template?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => {
                const t = deleting;
                if (!t) return;
                void run(async () => {
                  await send(`/api/rider-templates/${t.id}`, { method: 'DELETE' });
                  setDeleting(null);
                }, 'Template deleted');
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="rdl-modal-text">
          “{deleting?.name}” goes for good. Riders already started from it keep everything they copied.
        </p>
      </Modal>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { ArrowLeft, MoreHorizontal } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MobileAdvanceSectionAccordion } from '@/components/mobile/MobileAdvanceReadSections';
import { cacheShowBundle, readShowBundleCache } from '@/lib/mobile/offline-show-cache';
import type { FileVm } from '@/lib/tour-files/types';

type Bundle = {
  routing: Record<string, unknown>;
  tour: Record<string, unknown>;
  advance: {
    sections: Array<{
      template_id: string;
      label: string;
      fields: { id: string; label: string; type: string }[];
      order?: number;
    }>;
    data: Record<string, Record<string, unknown>>;
  } | null;
};

export function MobileShowReader({ tourId, routingId }: { tourId: string; routingId: string }) {
  const router = useRouter();
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [files, setFiles] = useState<FileVm[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        const cached = readShowBundleCache(tourId, routingId) as Bundle | undefined;
        if (cached) {
          setBundle(cached);
          return;
        }
        setError('Offline — visit this show while online once to cache it.');
        return;
      }

      const res = await fetch(`/api/tours/${tourId}/advance/${routingId}`, { cache: 'no-store' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string }).error ?? 'Could not load');
      const json = (await res.json()) as Bundle;
      setBundle(json);
      cacheShowBundle(tourId, routingId, json);

      const fRes = await fetch(`/api/tours/${tourId}/files-json`, { cache: 'no-store' });
      if (fRes.ok) {
        const fJson = (await fRes.json()) as { files: FileVm[] };
        setFiles(fJson.files ?? []);
      }
    } catch (e) {
      const cached = readShowBundleCache(tourId, routingId) as Bundle | undefined;
      if (cached) setBundle(cached);
      setError((e as Error).message ?? 'Could not load');
    }
  }, [routingId, tourId]);

  useEffect(() => {
    void load();
  }, [load]);

  const routing = bundle?.routing as
    | {
        date?: string;
        venue_name?: string | null;
        city?: string;
        day_type?: string;
        address?: string | null;
      }
    | undefined;

  const sortedSections = useMemo(() => {
    const secs = bundle?.advance?.sections ?? [];
    return [...secs].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [bundle?.advance?.sections]);

  const showFiles = files.filter((f) => !f.showId || f.showId === routingId);

  return (
    <div className="min-h-[100dvh] bg-lp-bg text-[16px] leading-relaxed [&_.text-muted]:text-lp-text-secondary">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-lp-border bg-lp-bg/95 px-3 py-3 backdrop-blur">
        <button
          type="button"
          aria-label="Back"
          className="rounded-full p-2 text-lp-text-secondary hover:bg-lp-surface-hover"
          onClick={() => router.back()}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold leading-tight text-lp-text">
            {routing?.venue_name || routing?.city || 'Show'}
          </p>
          {routing?.city ? (
            <p className="truncate text-[13px] text-lp-text-secondary">{routing.city}</p>
          ) : null}
        </div>
        <details className="relative shrink-0">
          <summary className="cursor-pointer list-none rounded-full p-2 hover:bg-lp-surface-hover [&::-webkit-details-marker]:hidden">
            <MoreHorizontal className="h-5 w-5 text-lp-text-secondary" />
          </summary>
          <div className="absolute right-0 top-full mt-1 w-52 rounded-xl border border-lp-border bg-lp-surface py-1 shadow-lg">
            <Link href="/m/files" className="block px-4 py-2 text-sm text-lp-text hover:bg-lp-surface-hover">
              All files
            </Link>
            <Link href="/m/deal-memos" className="block px-4 py-2 text-sm text-lp-text hover:bg-lp-surface-hover">
              Deal memos
            </Link>
            <Link href="/m/today" className="block px-4 py-2 text-sm text-lp-text hover:bg-lp-surface-hover">
              Today picker
            </Link>
          </div>
        </details>
      </header>

      {error ? <p className="mx-4 mt-4 text-sm text-lp-error">{error}</p> : null}

      {!bundle && !error ? (
        <p className="px-4 py-16 text-center text-[15px] text-lp-text-secondary">Loading…</p>
      ) : bundle ? (
        <div className="space-y-4 px-4 py-6">
          <div className="rounded-2xl border border-lp-border bg-lp-surface p-4 shadow-[0_1px_4px_rgba(0,0,0,.06)]">
            <p className="text-[17px] font-semibold text-lp-text">{routing?.date ?? '—'}</p>
            {routing?.day_type ? (
              <p className="mt-2 inline-block rounded-full bg-lp-orange/15 px-2 py-0.5 text-[12px] font-semibold text-lp-orange">
                {routing.day_type}
              </p>
            ) : null}
            {routing?.address ? <p className="mt-4 text-[15px] text-lp-text">{routing.address}</p> : null}
          </div>

          <div className="rounded-2xl border border-lp-border bg-lp-surface p-4 shadow-[0_1px_4px_rgba(0,0,0,.06)]">
            <p className="text-[17px] font-semibold text-lp-text">Tech & channel list</p>
            <Link
              href={`/tours/${tourId}/channel-list`}
              className="mt-3 inline-flex rounded-lg bg-lp-orange px-4 py-2 text-[14px] font-semibold text-white"
            >
              Open channel list
            </Link>
          </div>

          {sortedSections.map((section) =>
            bundle.advance ? (
              <MobileAdvanceSectionAccordion
                key={section.template_id}
                section={section}
                data={bundle.advance.data?.[section.template_id] ?? {}}
              />
            ) : null
          )}

          <div className="rounded-2xl border border-lp-border bg-lp-surface p-4 shadow-[0_1px_4px_rgba(0,0,0,.06)]">
            <p className="text-[17px] font-semibold text-lp-text">
              Files for this date ({showFiles.length})
            </p>
            <Link href="/m/files" className="mt-2 inline-block text-[15px] text-lp-orange">
              View all tour files →
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

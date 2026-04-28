'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, Share2, Download } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useArtistTourContext } from '@/contexts/ArtistTourContext';
import type { FileVm } from '@/lib/tour-files/types';
import { getFileBlob, hasFileBlob, putFileBlob } from '@/lib/mobile/offline-file-blob-cache';

function cacheKey(tourId: string, fileId: string) {
  return `${tourId}::${encodeURIComponent(fileId)}`;
}

async function fetchBlobFromUrl(url: string): Promise<Blob | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

export default function MobileFileReaderPage() {
  const params = useParams();
  const router = useRouter();
  const routingId = typeof params?.id === 'string' ? params.id : '';
  const fileId = typeof params?.fileId === 'string' ? params.fileId : '';
  const { selectedTourId, hydrated } = useArtistTourContext();
  const [file, setFile] = useState<FileVm | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const key = useMemo(
    () => (selectedTourId && fileId ? cacheKey(selectedTourId, fileId) : ''),
    [selectedTourId, fileId]
  );

  useEffect(() => {
    if (!hydrated || !selectedTourId || !fileId) return;
    let cancelled = false;
    (async () => {
      try {
        const offline = typeof navigator !== 'undefined' && !navigator.onLine;
        if (offline && key) {
          const rec = await getFileBlob(key);
          if (rec) {
            const u = URL.createObjectURL(rec.blob);
            if (!cancelled) {
              setBlobUrl(u);
              setCached(true);
              setFile({
                id: fileId,
                source: 'other',
                filename: 'cached',
                mimeType: rec.mimeType,
                size: rec.blob.size,
                uploadedAt: new Date().toISOString(),
                uploadedByName: null,
                showId: null,
                personId: null,
                riderPackId: null,
                storageBucket: '',
                storagePath: '',
                linkedSummary: '',
              });
            }
            return;
          }
        }

        const res = await fetch(`/api/tours/${selectedTourId}/files-json`, { cache: 'no-store' });
        if (!res.ok) throw new Error('Could not load files');
        const j = (await res.json()) as { files: FileVm[] };
        const row = (j.files ?? []).find((f) => f.id === fileId) ?? null;
        if (!row) {
          if (!cancelled) setError('File not found');
          return;
        }
        if (!cancelled) setFile(row);

        const href = row.previewUrl ?? row.externalUrl ?? null;
        if (href) {
          const b = await fetchBlobFromUrl(href);
          if (b && key) {
            await putFileBlob(key, b, row.mimeType);
            if (!cancelled) setCached((await hasFileBlob(key)) ?? false);
          }
          if (b) {
            const u = URL.createObjectURL(b);
            if (!cancelled) setBlobUrl(u);
          } else if (!cancelled) setBlobUrl(href);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fileId, hydrated, key, selectedTourId]);

  useEffect(() => {
    return () => {
      if (blobUrl && blobUrl.startsWith('blob:')) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  const share = async () => {
    const href = file?.previewUrl ?? file?.externalUrl;
    if (!href || !navigator.share) return;
    try {
      await navigator.share({ title: file?.filename, url: href });
    } catch {
      /* dismiss */
    }
  };

  if (!hydrated)
    return <p className="px-4 py-16 text-center text-lp-text-secondary">Loading…</p>;
  if (!selectedTourId)
    return <p className="px-4 py-16 text-center text-lp-text-secondary">Select a tour first.</p>;

  const href = file?.previewUrl ?? file?.externalUrl ?? null;
  const mime = file?.mimeType?.toLowerCase() ?? '';
  const isPdf = mime.includes('pdf') || file?.filename.toLowerCase().endsWith('.pdf');
  const isImg = mime.startsWith('image/');

  return (
    <div className="flex min-h-[100dvh] flex-col bg-lp-bg">
      <header className="flex items-center gap-2 border-b border-lp-border bg-lp-surface px-2 py-2">
        <button
          type="button"
          className="rounded-full p-2 text-lp-text-secondary"
          aria-label="Back"
          onClick={() => router.push(`/m/show/${routingId}`)}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <p className="min-w-0 flex-1 truncate text-[15px] font-medium text-lp-text">{file?.filename ?? 'File'}</p>
        {typeof navigator !== 'undefined' && 'share' in navigator ? (
          <button type="button" className="rounded-full p-2 text-lp-orange" aria-label="Share link" onClick={() => void share()}>
            <Share2 className="h-5 w-5" />
          </button>
        ) : null}
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className="rounded-full p-2 text-lp-text-secondary" aria-label="Download">
            <Download className="h-5 w-5" />
          </a>
        ) : null}
      </header>

      {error ? <p className="p-4 text-sm text-lp-error">{error}</p> : null}

      {blobUrl && isImg ? (
        <div className="relative min-h-[50vh] w-full flex-1 touch-pan-x touch-pan-y">
          <Image src={blobUrl} alt="" fill className="object-contain" unoptimized sizes="100vw" />
        </div>
      ) : null}

      {blobUrl && isPdf ? (
        <embed src={blobUrl} type="application/pdf" className="min-h-[70vh] w-full flex-1 border-0" />
      ) : null}

      {file && !isPdf && !isImg ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <p className="text-[15px] text-lp-text-secondary">
            Preview not available in-app.
            {cached ? <span className="block text-xs text-lp-text-tertiary">Cached for offline</span> : null}
          </p>
          {href ? (
            <Link href={href} className="rounded-lg bg-lp-orange px-5 py-2 text-sm font-semibold text-white" target="_blank">
              Download
            </Link>
          ) : null}
        </div>
      ) : null}

      {!file && !error ? <p className="p-8 text-center text-lp-text-secondary">Loading…</p> : null}
    </div>
  );
}

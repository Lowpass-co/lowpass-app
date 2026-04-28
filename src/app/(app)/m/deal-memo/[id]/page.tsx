'use client';

import { ArrowLeft, Download, Share2 } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getDealMemoById, getSignedDealMemoDocumentUrl } from '@/lib/api/deal-memos';

export default function MobileDealMemoReadPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params?.id === 'string' ? params.id : '';
  const [url, setUrl] = useState<string | null>(null);
  const [title, setTitle] = useState('Deal memo');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const memo = await getDealMemoById(id);
        if (!memo) throw new Error('Not found');
        if (!cancelled) setTitle(memo.title);
        if (!memo.documentUrl) {
          if (!cancelled) setError('No document uploaded for this memo.');
          return;
        }
        const signed = await getSignedDealMemoDocumentUrl(id);
        if (!cancelled) setUrl(signed);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const share = async () => {
    if (!url || !navigator.share) return;
    try {
      await navigator.share({ title, url });
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-lp-bg pb-14">
      <header className="flex items-center gap-2 border-b border-lp-border bg-lp-surface px-2 py-2">
        <button type="button" className="rounded-full p-2" aria-label="Back" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5 text-lp-text-secondary" />
        </button>
        <p className="min-w-0 flex-1 truncate text-[15px] font-semibold text-lp-text">{title}</p>
        {typeof navigator !== 'undefined' && 'share' in navigator && url ? (
          <button type="button" aria-label="Share" className="p-2 text-lp-orange" onClick={() => void share()}>
            <Share2 className="h-5 w-5" />
          </button>
        ) : null}
        {url ? (
          <a href={url} download className="p-2 text-lp-text-secondary" target="_blank" rel="noreferrer" aria-label="Download">
            <Download className="h-5 w-5" />
          </a>
        ) : null}
      </header>
      {error ? <p className="p-4 text-[15px] text-lp-error">{error}</p> : null}
      {url ? (
        <embed src={url} type="application/pdf" className="min-h-[75vh] w-full flex-1 border-0" />
      ) : !error ? (
        <p className="p-8 text-center text-lp-text-secondary">Loading…</p>
      ) : null}
    </div>
  );
}

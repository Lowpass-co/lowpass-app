'use client';

/* ============================================
   LOWPASS — <ReceiptThumb> (Receipts overhaul B1)

   A transaction's receipt chip: a small thumbnail for an image receipt (signed
   URL — the bucket is private), the vendor/number label, and click → lightbox
   (image) / open in a new tab (PDF). Falls back to a 📎 + label when there's no
   stored file (legacy blank receipts). Decoupled from budget via the injected
   `signUrl` — the host (BudgetGridView) provides the signed-URL fetch.
   ============================================ */

import { useEffect, useState } from 'react';

export function ReceiptThumb({
  receiptId,
  label,
  signUrl,
}: {
  receiptId: string;
  label: string;
  signUrl: (receiptId: string) => Promise<string | null>;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState(false);

  useEffect(() => {
    let active = true;
    void signUrl(receiptId).then((u) => {
      if (active) setUrl(u);
    });
    return () => {
      active = false;
    };
  }, [receiptId, signUrl]);

  const isImage = !!url && !/\.pdf(\?|$)/i.test(url);

  const onClick = () => {
    if (!url) return;
    if (isImage) setLightbox(true);
    else window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      <span
        className="rcpt has"
        onClick={url ? onClick : undefined}
        style={{ cursor: url ? 'pointer' : 'default', display: 'inline-flex', alignItems: 'center', gap: 5 }}
        title={url ? (isImage ? 'View receipt' : 'Open PDF') : label}
      >
        {isImage && url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt=""
            style={{ width: 20, height: 20, objectFit: 'cover', borderRadius: 'var(--lp-radius-sm)', border: '1px solid var(--lp-border)' }}
          />
        ) : (
          <span aria-hidden>📎</span>
        )}
        {label}
      </span>

      {lightbox && isImage && url ? (
        <div
          onClick={() => setLightbox(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 'var(--lp-z-command-palette)' as React.CSSProperties['zIndex'],
            background: 'color-mix(in srgb, var(--lp-text) 78%, transparent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, cursor: 'zoom-out',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="Receipt" style={{ maxWidth: '92vw', maxHeight: '88vh', borderRadius: 'var(--lp-radius-md)', boxShadow: 'var(--lp-shadow-lg)' }} />
        </div>
      ) : null}
    </>
  );
}

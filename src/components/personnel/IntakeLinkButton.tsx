'use client';

/* ============================================
   LOWPASS — <IntakeLinkButton> (Sprint 10 §2.4)

   Renders a small "Generate intake link" button in the
   PersonnelDetailSlideOver header. On click, POSTs to
   /api/personnel/[id]/intake-token to mint a fresh token, then
   shows the resulting public URL with a Copy-to-clipboard
   button.

   Visible only in edit mode (a saved personnel id is required
   to bind the token to).
   ============================================ */

import { Check, Copy, Link2, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/components/ui/Toast';

interface IntakeLinkButtonProps {
  personnelId: string;
}

export function IntakeLinkButton({ personnelId }: IntakeLinkButtonProps) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/personnel/${personnelId}/intake-token`, {
        method: 'POST',
      });
      const body = (await res.json().catch(() => null)) as
        | { url?: string; error?: string }
        | null;
      if (!res.ok || !body?.url) {
        showToast(body?.error ?? 'Could not generate personnel info form link.');
        return;
      }
      setGeneratedUrl(body.url);
      // Best-effort auto-copy. If it fails (older Safari),
      // user can click Copy.
      try {
        await navigator.clipboard.writeText(body.url);
        setCopied(true);
        showToast('Personnel info form link copied to clipboard.');
      } catch {
        showToast('Personnel info form link generated. Click Copy to share.');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!generatedUrl) return;
    try {
      await navigator.clipboard.writeText(generatedUrl);
      setCopied(true);
      showToast('Copied.');
    } catch {
      showToast('Could not copy. Select the URL manually.');
    }
  };

  if (generatedUrl) {
    return (
      <div
        className="flex items-center"
        style={{
          gap: 6,
          padding: '4px 8px',
          fontSize: 'var(--lp-text-xs)',
          background: 'var(--lp-bg-tertiary)',
          border: '1px solid var(--lp-border)',
          borderRadius: 'var(--lp-radius-md)',
          maxWidth: 280,
        }}
      >
        <Link2 size={12} strokeWidth={2.4} style={{ color: 'var(--lp-text-tertiary)', flexShrink: 0 }} />
        <span
          className="truncate"
          style={{
            fontFamily: 'var(--lp-font-mono, ui-monospace)',
            color: 'var(--lp-text-secondary)',
          }}
          title={generatedUrl}
        >
          {generatedUrl.replace(/^https?:\/\//, '')}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copy personnel info form link"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 6px',
            fontSize: 'var(--lp-text-2xs)',
            fontWeight: 600,
            color: copied ? 'var(--color-lp-success, #1f8a4c)' : 'var(--color-lp-orange)',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          {copied ? <Check size={12} strokeWidth={2.4} /> : <Copy size={12} strokeWidth={2.4} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void handleGenerate()}
      disabled={loading}
      className="btn-transition inline-flex items-center"
      style={{
        gap: 4,
        padding: 'var(--lp-space-1) var(--lp-space-3)',
        fontSize: 'var(--lp-text-xs)',
        fontWeight: 'var(--lp-weight-semibold)',
        color: 'var(--lp-text)',
        background: 'transparent',
        border: '1px solid var(--lp-border-strong)',
        borderRadius: 'var(--lp-radius-md)',
        cursor: loading ? 'not-allowed' : 'pointer',
        opacity: loading ? 0.7 : 1,
      }}
    >
      {loading ? (
        <Loader2 size={12} className="animate-spin" />
      ) : (
        <Link2 size={12} strokeWidth={2.4} />
      )}
      Request Personnel Info Form
    </button>
  );
}

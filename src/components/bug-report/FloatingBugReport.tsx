/* ============================================
   LOWPASS — Floating bug report (Drive-backed)

   FAB opens a panel: description, optional screen capture,
   submit to POST /api/bug-reports.
   ============================================ */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bug, Camera, Loader2, X } from 'lucide-react';

async function captureScreenAsPngBlob(): Promise<Blob | null> {
  let stream: MediaStream | null = null;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    await video.play();
    await new Promise<void>(resolve => {
      const tick = () => {
        if (video.videoWidth > 0) resolve();
        else requestAnimationFrame(tick);
      };
      tick();
    });
    await new Promise(r => setTimeout(r, 150));
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);
    stream.getTracks().forEach(t => t.stop());
    stream = null;
    return await new Promise<Blob | null>(resolve => {
      canvas.toBlob(b => resolve(b), 'image/png');
    });
  } catch {
    if (stream) stream.getTracks().forEach(t => t.stop());
    return null;
  }
}

export function FloatingBugReport() {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [screenshot, setScreenshot] = useState<Blob | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const onCapture = useCallback(async () => {
    setError(null);
    setCapturing(true);
    try {
      const blob = await captureScreenAsPngBlob();
      if (blob) setScreenshot(blob);
    } finally {
      setCapturing(false);
    }
  }, []);

  const onSubmit = useCallback(async () => {
    const text = description.trim();
    if (!text) {
      setError('Please describe what went wrong.');
      return;
    }
    setError(null);
    setSubmitting(true);
    setSuccess(false);
    try {
      const form = new FormData();
      form.set('description', text);
      form.set('pageUrl', typeof window !== 'undefined' ? window.location.href : '');
      form.set('userAgent', typeof navigator !== 'undefined' ? navigator.userAgent : '');
      if (screenshot) {
        form.set('screenshot', new File([screenshot], 'screenshot.png', { type: 'image/png' }));
      }
      const res = await fetch('/api/bug-reports', { method: 'POST', body: form });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? `Could not submit (${res.status}).`);
        return;
      }
      setSuccess(true);
      setDescription('');
      setScreenshot(null);
      setTimeout(() => {
        setSuccess(false);
        setOpen(false);
      }, 1800);
    } catch {
      setError('Network error. Try again.');
    } finally {
      setSubmitting(false);
    }
  }, [description, screenshot]);

  return (
    <>
      <button
        type="button"
        aria-label="Report a bug"
        className="fixed bottom-6 right-6 z-[100] flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105 active:scale-95"
        style={{
          backgroundColor: 'var(--lp-surface)',
          border: '1px solid var(--lp-border)',
          color: 'var(--lp-text)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
        }}
        onClick={() => {
          setOpen(true);
          setError(null);
          setSuccess(false);
        }}
      >
        <Bug size={22} strokeWidth={2} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[101] flex items-end justify-end p-4 sm:items-center sm:justify-center sm:p-6"
          style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
          onClick={e => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl shadow-2xl"
            style={{ backgroundColor: 'var(--lp-surface)', border: '1px solid var(--lp-border)' }}
            onClick={e => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between border-b px-5 py-4"
              style={{ borderColor: 'var(--lp-border)' }}
            >
              <div>
                <h2 className="text-base font-bold" style={{ color: 'var(--lp-text)' }}>
                  Report a bug
                </h2>
                <p className="mt-0.5 text-xs" style={{ color: 'var(--lp-text-tertiary)' }}>
                  Describe the issue. Optionally capture your screen after you pick what to share.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                className="rounded-lg p-1.5 transition-colors"
                style={{ color: 'var(--lp-text-tertiary)' }}
                onClick={() => setOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
              <label className="text-xs font-semibold" style={{ color: 'var(--lp-text-secondary)' }}>
                What happened?
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={6}
                className="resize-y rounded-xl px-3 py-2 text-sm outline-none ring-0"
                style={{
                  backgroundColor: 'var(--lp-bg-secondary)',
                  border: '1px solid var(--lp-border)',
                  color: 'var(--lp-text)',
                }}
                placeholder="Steps to reproduce, what you expected, what you saw…"
              />

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={capturing}
                  className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-50"
                  style={{
                    backgroundColor: 'var(--lp-bg-secondary)',
                    border: '1px solid var(--lp-border)',
                    color: 'var(--lp-text)',
                  }}
                  onClick={onCapture}
                >
                  {capturing ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
                  {screenshot ? 'Replace screenshot' : 'Capture screenshot'}
                </button>
                {screenshot && (
                  <>
                    <span className="text-xs" style={{ color: 'var(--lp-text-tertiary)' }}>
                      Screenshot ready ({Math.round(screenshot.size / 1024)} KB)
                    </span>
                    <button
                      type="button"
                      className="text-xs font-semibold underline"
                      style={{ color: 'var(--lp-text-secondary)' }}
                      onClick={() => setScreenshot(null)}
                    >
                      Remove
                    </button>
                  </>
                )}
              </div>

              {error && (
                <p className="text-sm" style={{ color: '#ef4444' }}>
                  {error}
                </p>
              )}
              {success && (
                <p className="text-sm" style={{ color: '#22c55e' }}>
                  Thanks — your report was saved.
                </p>
              )}
            </div>

            <div
              className="flex justify-end gap-2 border-t px-5 py-4"
              style={{ borderColor: 'var(--lp-border)' }}
            >
              <button
                type="button"
                className="rounded-lg px-4 py-2 text-sm font-semibold"
                style={{ color: 'var(--lp-text-secondary)' }}
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
                style={{ backgroundColor: '#FF4500' }}
                onClick={onSubmit}
              >
                {submitting && <Loader2 size={16} className="animate-spin" />}
                Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ============================================
   LOWPASS — Floating bug report

   FAB opens a panel: title, description, steps to reproduce,
   severity, optional page screenshot (html2canvas-pro, no picker).
   Submits to POST /api/bug-reports (Supabase-backed).
   ============================================ */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bug, Camera, Loader2, X } from 'lucide-react';
import { collectBrowserEnv } from '@/lib/browser-env';

type Severity = 'low' | 'medium' | 'high' | 'critical';

async function capturePageScreenshot(): Promise<Blob | null> {
  try {
    const mod = await import('html2canvas-pro');
    const html2canvas = mod.default;
    const canvas = await html2canvas(document.documentElement, {
      useCORS: true,
      allowTaint: false,
      backgroundColor: null,
      logging: false,
      scale: Math.min(window.devicePixelRatio || 1, 2),
      windowWidth: document.documentElement.scrollWidth,
      windowHeight: document.documentElement.scrollHeight,
      ignoreElements: (el) => el.hasAttribute('data-bug-report-root'),
    });
    return await new Promise<Blob | null>(resolve => {
      canvas.toBlob(b => resolve(b), 'image/png');
    });
  } catch (err) {
    console.error('[bug-report] screenshot failed:', err);
    return null;
  }
}

const SEVERITY_OPTIONS: { value: Severity; label: string; color: string }[] = [
  { value: 'low', label: 'Low', color: '#22c55e' },
  { value: 'medium', label: 'Medium', color: '#eab308' },
  { value: 'high', label: 'High', color: '#f97316' },
  { value: 'critical', label: 'Critical', color: '#ef4444' },
];

export function FloatingBugReport() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [stepsToReproduce, setStepsToReproduce] = useState('');
  const [severity, setSeverity] = useState<Severity>('medium');
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

  const reset = useCallback(() => {
    setTitle('');
    setDescription('');
    setStepsToReproduce('');
    setSeverity('medium');
    setScreenshot(null);
    setError(null);
    setSuccess(false);
  }, []);

  const onCapture = useCallback(async () => {
    setError(null);
    setCapturing(true);
    try {
      const blob = await capturePageScreenshot();
      if (blob) setScreenshot(blob);
      else setError('Could not capture screenshot.');
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
      const env = collectBrowserEnv();
      const form = new FormData();
      form.set('description', text);
      if (title.trim()) form.set('title', title.trim());
      if (stepsToReproduce.trim()) form.set('stepsToReproduce', stepsToReproduce.trim());
      form.set('severity', severity);
      form.set('pageUrl', env.pageUrl);
      form.set('pagePath', env.pagePath);
      form.set('userAgent', env.userAgent);
      form.set('browser', env.browser);
      form.set('os', env.os);
      form.set('viewportWidth', String(env.viewportWidth));
      form.set('viewportHeight', String(env.viewportHeight));
      form.set('devicePixelRatio', String(env.devicePixelRatio));
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
      reset();
      setTimeout(() => {
        setSuccess(false);
        setOpen(false);
      }, 1500);
    } catch {
      setError('Network error. Try again.');
    } finally {
      setSubmitting(false);
    }
  }, [title, description, stepsToReproduce, severity, screenshot, reset]);

  return (
    <div data-bug-report-root>
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
                  Help us fix it faster — a screenshot of this page is just one click.
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
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold" style={{ color: 'var(--lp-text-secondary)' }}>
                  Title (optional)
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  maxLength={200}
                  placeholder="Short summary"
                  className="rounded-lg px-3 py-2 text-sm outline-none"
                  style={{
                    backgroundColor: 'var(--lp-bg-secondary)',
                    border: '1px solid var(--lp-border)',
                    color: 'var(--lp-text)',
                  }}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold" style={{ color: 'var(--lp-text-secondary)' }}>
                  What happened?
                </label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={5}
                  className="resize-y rounded-lg px-3 py-2 text-sm outline-none"
                  style={{
                    backgroundColor: 'var(--lp-bg-secondary)',
                    border: '1px solid var(--lp-border)',
                    color: 'var(--lp-text)',
                  }}
                  placeholder="What you saw, and what you expected."
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold" style={{ color: 'var(--lp-text-secondary)' }}>
                  Steps to reproduce (optional)
                </label>
                <textarea
                  value={stepsToReproduce}
                  onChange={e => setStepsToReproduce(e.target.value)}
                  rows={3}
                  className="resize-y rounded-lg px-3 py-2 text-sm outline-none"
                  style={{
                    backgroundColor: 'var(--lp-bg-secondary)',
                    border: '1px solid var(--lp-border)',
                    color: 'var(--lp-text)',
                  }}
                  placeholder={"1. Go to…\n2. Click…\n3. See…"}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold" style={{ color: 'var(--lp-text-secondary)' }}>
                  Severity
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {SEVERITY_OPTIONS.map(opt => {
                    const active = severity === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setSeverity(opt.value)}
                        className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors"
                        style={{
                          backgroundColor: active ? opt.color : 'var(--lp-bg-secondary)',
                          color: active ? '#fff' : 'var(--lp-text-secondary)',
                          border: `1px solid ${active ? opt.color : 'var(--lp-border)'}`,
                        }}
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: active ? '#fff' : opt.color }}
                        />
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

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
                  {screenshot ? 'Replace screenshot' : 'Capture page'}
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
    </div>
  );
}

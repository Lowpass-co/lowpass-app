'use client';

import { X } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';

const DISMISS_MS = 30 * 24 * 60 * 60 * 1000;
const STORAGE_DISMISS_UNTIL = 'lp:pwa-install-dismiss-until';

type BeforeInstallPromptEventLike = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function readDismissUntil(): number {
  try {
    return parseInt(localStorage.getItem(STORAGE_DISMISS_UNTIL) ?? '0', 10);
  } catch {
    return 0;
  }
}

function persistDismiss(): void {
  try {
    localStorage.setItem(STORAGE_DISMISS_UNTIL, String(Date.now() + DISMISS_MS));
  } catch {
    /* ignore */
  }
}

function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    (window.matchMedia?.('(display-mode: standalone)').matches ?? false) ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iOS Safari — no beforeinstallprompt. */
function isIosSafariLikely(): boolean {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const iOS =
    /iPad|iPhone|iPod/.test(ua) ||
    ((navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1) ?? false);
  const webKit = /AppleWebKit/.test(ua);
  const notChrome = !/CriOS|FxiOS|EdgiOS/.test(ua);
  return iOS && webKit && notChrome;
}

export type InstallPromptProps = {
  visitCount: number;
  /** Below Tailwind `lg` (1024px). */
  mobile: boolean;
};

export function InstallPrompt({ visitCount, mobile }: InstallPromptProps) {
  const [show, setShow] = useState(false);
  const [deferredInstaller, setDeferredInstaller] = useState<BeforeInstallPromptEventLike | null>(
    null
  );

  const dismiss = useCallback(() => {
    persistDismiss();
    setShow(false);
    setDeferredInstaller(null);
  }, []);

  useEffect(() => {
    if (!mobile || visitCount < 3) return;
    if (isStandaloneDisplay()) return;
    if (Date.now() < readDismissUntil()) return;

    if (isIosSafariLikely()) {
      queueMicrotask(() => setShow(true));
      return;
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      const evt = e as BeforeInstallPromptEventLike;
      queueMicrotask(() => {
        setDeferredInstaller(evt);
        setShow(true);
      });
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, [mobile, visitCount]);

  const onInstallClick = async () => {
    if (isIosSafariLikely() || !deferredInstaller) return;
    await deferredInstaller.prompt();
    try {
      await deferredInstaller.userChoice;
    } catch {
      /* ignore */
    }
    setDeferredInstaller(null);
    setShow(false);
  };

  if (!show || !mobile) return null;

  const iosHints = isIosSafariLikely();

  return (
    <div
      className="fixed bottom-4 left-4 right-4 z-[100] lg:hidden"
      role="dialog"
      aria-labelledby="lp-pwa-install-title"
    >
      <div className="mx-auto max-w-lg rounded-xl border border-lp-border bg-lp-surface p-4 shadow-lg dark:bg-lp-surface dark:shadow-black/40">
        <div className="flex gap-3">
          <Image
            src="/icons/icon-192.png"
            alt=""
            className="h-12 w-12 shrink-0 rounded-lg"
            width={48}
            height={48}
            sizes="48px"
          />
          <div className="min-w-0 flex-1 pt-0.5">
            <h2 id="lp-pwa-install-title" className="text-sm font-semibold text-lp-text">
              {iosHints ? 'Add Lowpass to Home Screen' : 'Install Lowpass'}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-lp-text-secondary">
              {iosHints
                ? "Tap Share, then \u201cAdd to Home Screen\u201d for quick access from your home screen."
                : 'Install the app for a full-screen shortcut on your device.'}
            </p>
            {!iosHints && deferredInstaller ? (
              <button
                type="button"
                onClick={() => void onInstallClick()}
                className="mt-3 inline-flex rounded-lg bg-lp-orange px-3 py-2 text-xs font-semibold text-white hover:bg-lp-orange-hover"
              >
                Install Lowpass
              </button>
            ) : null}
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            className="shrink-0 rounded-lg p-1 text-lp-text-secondary hover:bg-lp-surface-hover hover:text-lp-text"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}

'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

type ToastType = 'success' | 'error';

/** One button on the toast (e.g. Undo). Clicking it runs onClick and closes
 *  the toast. */
export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  action?: ToastAction;
  /** How long it stays up. Default 3 s; give an action toast long enough to
   *  be read and clicked. */
  durationMs?: number;
}

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  action?: ToastAction;
  exiting?: boolean;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      showToast: (message: string) => {
        console.warn('Toast used without ToastProvider:', message);
      },
    };
  }
  return ctx;
}

const AUTO_DISMISS_MS = 3000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextIdRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 200);
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'success', options?: ToastOptions) => {
    const id = nextIdRef.current++;
    setToasts((prev) => [...prev, { id, message, type, action: options?.action }]);
    setTimeout(() => dismiss(id), options?.durationMs ?? AUTO_DISMISS_MS);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 transition-[gap] duration-200"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'flex items-center rounded-lg border px-4 py-3 text-sm font-medium shadow-lg',
              t.exiting ? 'animate-toast-exit' : 'animate-toast-enter',
              t.type === 'success' &&
                'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-200',
              t.type === 'error' &&
                'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/80 dark:text-red-200'
            )}
          >
            {t.message}
            {t.action ? (
              <button
                type="button"
                onClick={() => {
                  dismiss(t.id);
                  t.action?.onClick();
                }}
                className="ml-3 rounded px-2 py-0.5 font-semibold underline underline-offset-2 hover:no-underline"
              >
                {t.action.label}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

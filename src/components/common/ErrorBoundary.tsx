/* ============================================
   LOWPASS — Error Boundary

   Catches render errors and shows a friendly UI. Re-throws Next.js
   framework errors (redirect / notFound / dynamic-rendering signals) so
   the framework handles them rather than this boundary.
   ============================================ */

'use client';

import React from 'react';
import { LowpassLogo } from './LowpassLogo';

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Next.js encodes special framework errors (redirect, notFound, dynamic
 * rendering signals) via `error.digest`. An ErrorBoundary must let those
 * propagate so the framework can act on them — catching them is what
 * causes server `redirect()` calls to render a generic error page instead
 * of redirecting.
 *
 * The digest values aren't a stable public API but they've been consistent
 * since Next 13 and are documented in the Next.js source. The string-prefix
 * check below is the same approach Next's own `error.tsx` template uses.
 */
function isNextFrameworkError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const digest = (error as { digest?: unknown }).digest;
  if (typeof digest !== 'string') return false;
  return (
    digest.startsWith('NEXT_REDIRECT') ||
    digest === 'NEXT_NOT_FOUND' ||
    digest.startsWith('DYNAMIC_SERVER_USAGE') ||
    digest.startsWith('BAILOUT_TO_CLIENT_SIDE_RENDERING')
  );
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    if (isNextFrameworkError(error)) {
      // Re-throw so Next.js's framework handlers can react (redirect, notFound, etc.)
      throw error;
    }
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (isNextFrameworkError(error)) {
      return;
    }
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-6">
          <LowpassLogo className="h-8 text-lp-text-tertiary" />
          <div className="text-center">
            <h1 className="font-display text-xl font-semibold text-lp-text">Something went wrong</h1>
            <p className="mt-2 text-sm text-lp-text-secondary">Try refreshing the page.</p>
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-xl bg-lp-orange px-4 py-2 text-sm font-medium text-white hover:bg-lp-orange-hover"
          >
            Refresh
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

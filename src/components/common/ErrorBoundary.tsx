/* ============================================
   LOWPASS — Error Boundary

   Catches render errors and shows a friendly UI.
   ============================================ */

'use client';

import React from 'react';
import { LowpassLogo } from './LowpassLogo';

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
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

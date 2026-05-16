'use client';

/* ============================================
   LOWPASS — <PrintTrigger> (Sprint 12 §2)

   Tiny client wrapper exposing window.print() as a button.
   Lives next to the print-labels server page because the
   server component can't bind an onClick handler.

   Auto-firing window.print() on mount was considered and
   rejected — the operator wants a beat to glance at the grid
   before sending it to the label printer.
   ============================================ */

import { Printer } from 'lucide-react';

interface PrintTriggerProps {
  disabled?: boolean;
}

export function PrintTrigger({ disabled = false }: PrintTriggerProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => window.print()}
      className="btn-transition btn-primary-press inline-flex items-center"
      style={{
        gap: 6,
        padding: 'var(--lp-space-2) var(--lp-space-4)',
        fontSize: 'var(--lp-text-sm)',
        fontWeight: 'var(--lp-weight-semibold)',
        color: 'var(--lp-text-inverse)',
        background: 'var(--color-lp-orange)',
        border: '1px solid transparent',
        borderRadius: 'var(--lp-radius-md)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Printer size={14} strokeWidth={2.5} />
      Print
    </button>
  );
}

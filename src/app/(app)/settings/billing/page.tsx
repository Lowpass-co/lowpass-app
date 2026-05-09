/* ============================================
   LOWPASS — /settings/billing (Sprint 10 §1.7 — placeholder)

   Stripe billing integration ships in Sprint 11 §3. This page
   exists so the Settings sub-nav doesn't 404 + so Adam's
   bookmark / future links keep resolving.
   ============================================ */

import { SettingsSubNav } from '@/components/settings/SettingsSubNav';

export default function SettingsBillingPage() {
  return (
    <>
      <SettingsSubNav pathname="/settings/billing" />
      <div
        className="mx-auto w-full max-w-3xl"
        style={{ padding: 'var(--lp-space-4)' }}
      >
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-lp-text">Billing</h1>
          <p className="mt-1 text-sm text-lp-text-secondary">
            Workspace subscription, invoices, and payment method.
          </p>
        </header>
        <div
          role="status"
          style={{
            padding: 'var(--lp-space-4)',
            background: 'var(--lp-panel)',
            border: '1px dashed var(--lp-border-strong)',
            borderRadius: 'var(--lp-radius-md)',
            fontSize: 'var(--lp-text-sm)',
            color: 'var(--lp-text-secondary)',
          }}
        >
          Coming Sprint 11 — Stripe integration for workspace
          subscriptions, invoice history, and payment-method
          management. Direct invoicing covers the alpha period.
        </div>
      </div>
    </>
  );
}

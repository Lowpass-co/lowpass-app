/* ============================================
   LOWPASS — /settings/integrations (Sprint 10 §1.7 — placeholder)

   Third-party integrations (calendar sync, accounting export,
   etc.) ship in Sprint 11+. Page exists so the Settings
   sub-nav resolves cleanly.
   ============================================ */

import { SettingsSubNav } from '@/components/settings/SettingsSubNav';

export default function SettingsIntegrationsPage() {
  return (
    <>
      <SettingsSubNav pathname="/settings/integrations" />
      <div
        className="mx-auto w-full max-w-3xl"
        style={{ padding: 'var(--lp-space-4)' }}
      >
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-lp-text">Integrations</h1>
          <p className="mt-1 text-sm text-lp-text-secondary">
            Connect Lowpass to the rest of your stack.
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
          Coming soon — Google Calendar / iCal sync, Xero +
          QuickBooks export, Slack notifications, and OAuth-based
          partner platform connections.
        </div>
      </div>
    </>
  );
}

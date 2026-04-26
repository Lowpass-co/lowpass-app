import { listAppPageShell } from '@/components/shell/app-page-shells';

export default async function VenuesPage() {
  return listAppPageShell(
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-bold text-lp-text">Venues</h1>
      <p className="mt-1 text-sm text-lp-text-secondary">Venue and contact database. Coming in Phase 1F.</p>
    </div>
  );
}

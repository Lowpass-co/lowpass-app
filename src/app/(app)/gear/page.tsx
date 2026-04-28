import { listAppPageShell } from '@/components/shell/app-page-shells';
import { GearLibraryClient } from '@/components/gear/GearLibraryClient';

export default async function GearPage() {
  return listAppPageShell(
    <div className="mx-auto max-w-6xl space-y-4">
      <h1 className="text-2xl font-bold text-lp-text">Gear Library</h1>
      <GearLibraryClient />
    </div>
  );
}

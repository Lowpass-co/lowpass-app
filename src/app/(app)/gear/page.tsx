import { listAppPageShell } from '@/components/shell/app-page-shells';
import { GearLibraryClient } from '@/components/gear/GearLibraryClient';
import { PageHeader } from '@/components/ui/PageHeader';

export default async function GearPage() {
  return listAppPageShell(
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader title="Gear Library" />
      <GearLibraryClient />
    </div>
  );
}

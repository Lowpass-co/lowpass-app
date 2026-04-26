import { listAppPageShell } from '@/components/shell/app-page-shells';
import AdvanceCrossTourPage from '@/components/advance/AdvanceCrossTourPage';

export default async function AdvancePage() {
  return listAppPageShell(<AdvanceCrossTourPage />);
}

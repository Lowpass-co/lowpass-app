/* ============================================
   LOWPASS — Profile Page

   Server entry: shell + data fetching boundaries stay server-side.
   Form UI lives in ProfilePageClient.
   ============================================ */

import { listAppPageShell } from '@/components/shell/app-page-shells';
import { ProfilePageClient } from './ProfilePageClient';

export default async function ProfilePage() {
  return listAppPageShell(<ProfilePageClient />);
}

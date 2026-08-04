/* ============================================
   LOWPASS — Profile Page (S-3b)

   The LAST non-admin surface on shell-v1's listAppPageShell — now off it.
   Chrome comes from the (you) layout's <ShellV3Mount> (YOU_RAIL, "Account"
   active). Form UI lives in ProfilePageClient.
   ============================================ */

import { ProfilePageClient } from './ProfilePageClient';

export default async function ProfilePage() {
  return <ProfilePageClient />;
}

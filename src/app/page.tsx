/* ============================================
   LOWPASS — Root Page

   Phase 1 §D: /dashboard retired (folded into /). Root now lands on
   the artist picker at /artists. Once an artist is selected, the
   user navigates to /artists/[id] for the artist Home.
   ============================================ */

import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/artists');
}

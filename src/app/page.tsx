/* ============================================
   LOWPASS — Root Page

   Redirects to dashboard (or login when auth
   is implemented).
   ============================================ */

import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/dashboard');
}

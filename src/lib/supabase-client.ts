/* ============================================
   LOWPASS — Supabase Client (Browser)

   Creates a Supabase client for use in
   client-side components (React hooks, etc.).
   ============================================ */

import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

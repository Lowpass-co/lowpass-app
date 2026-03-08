/* ============================================
   LOWPASS — Route Middleware

   Protects authenticated routes.
   Redirects unauthenticated users to /login.
   Redirects authenticated users away from /login.
   ============================================ */

import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase-middleware';

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match page routes only — skip:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public files (images, icons, etc.)
     * - API routes (they handle their own auth via createServerSupabaseClient)
     */
    '/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};

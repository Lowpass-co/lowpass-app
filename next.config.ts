import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* R5-3 — View Transitions for the routing spine (ledger → rail collapse).
     Verified BEFORE enabling: needs-experimental-react.js gates the experimental
     React channel on `taint` / `transitionIndicator` ONLY, so this flag does NOT
     ship experimental React to production — it stays on the stable runtime, which
     already contains startViewTransition.
     Cowork instrumented a real client nav with the flag OFF and counted ZERO
     startViewTransition calls, so Next 16.1.6 does not wrap client navigation by
     default. Whether this flag changes that is measured after deploy. If the count
     is still zero we stop here — we do NOT collapse routes into one client surface
     to force a morph, because that would trade deep-linkable URLs and the
     server-sliced crew view for an animation, and the spine already works. */
  experimental: { viewTransition: true },

  /* RC-5 removed the outputFileTracingIncludes block that lived here. It existed
     because pdfFirstPage.ts read pdfjs-dist off disk at runtime — a path the file
     tracer cannot see, so the lambda shipped without it. The rasteriser is gone
     (the API reads PDFs natively now), so the workaround goes with it. Kept as a
     note because the failure mode is worth remembering: a runtime-resolved
     dependency is invisible to tracing and fails ONLY in production. */

  images: {
    remotePatterns: [
      // Supabase storage — avatars and any other workspace-uploaded assets.
      { protocol: 'https', hostname: '**.supabase.co' },
      // Google OAuth avatars.
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    ],
  },
  // ============================================
  // Security audit §H1 — HTTP security headers
  //
  // ENFORCED (safe, will not break rendering):
  //   HSTS, X-Frame-Options + CSP frame-ancestors (clickjacking),
  //   nosniff, Referrer-Policy, Permissions-Policy.
  //
  // CSP for script/style/img/connect is shipped as REPORT-ONLY so it
  // cannot white-screen the app. Watch the browser console / a report
  // collector for violations, tighten the directives, then graduate it
  // to an enforced `Content-Security-Policy` by renaming the header
  // (drop "-Report-Only") and removing 'unsafe-inline'/'unsafe-eval'
  // once a nonce strategy is in place. See AUDIT handoff notes.
  // ============================================
  async headers() {
    const reportOnlyCsp = [
      "default-src 'self'",
      // Next.js App Router injects inline bootstrap scripts; until a nonce
      // strategy is wired, 'unsafe-inline' is required. Report-only first.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.googleapis.com https://places.googleapis.com https://maps.googleapis.com",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; ');

    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
          },
          // Enforced clickjacking control (safe to enforce on its own).
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
          // Everything else observed, not enforced — see comment above.
          { key: 'Content-Security-Policy-Report-Only', value: reportOnlyCsp },
        ],
      },
    ];
  },
  async redirects() {
    return [
      // ============================================
      // Product Split Phase 1 §C — legacy → product-prefixed routes
      //
      // Order matters: Next applies these in order, and `redirects`
      // run BEFORE filesystem routes. So /tours/[id]/budget will
      // 301 even though src/app/(app)/tours/[id]/budget/page.tsx
      // still exists on disk.
      //
      // Specific paths come first (deeper segments before shallow)
      // so the bare /tours/:id catch-all doesn't swallow them.
      // ============================================

      // ===== Operations sub-paths =====
      // (specific → general)
      {
        source: '/tours/:id/rider-packs/:packId',
        destination: '/operations/:id/riders/:packId',
        permanent: true,
      },
      {
        source: '/tours/:id/rider-packs',
        destination: '/operations/:id/riders',
        permanent: true,
      },
      {
        source: '/tours/:id/routing',
        destination: '/operations/:id/routing',
        permanent: true,
      },
      {
        source: '/tours/:id/channel-list',
        destination: '/operations/:id/channel-list',
        permanent: true,
      },
      {
        source: '/tours/:id/rooming',
        destination: '/operations/:id/rooming',
        permanent: true,
      },
      {
        source: '/tours/:id/personnel',
        destination: '/operations/:id/personnel',
        permanent: true,
      },
      {
        source: '/tours/:id/payroll',
        destination: '/operations/:id/payroll',
        permanent: true,
      },
      {
        source: '/tours/:id/day',
        destination: '/operations/:id/day',
        permanent: true,
      },
      {
        source: '/tours/:id/files',
        destination: '/operations/:id/files',
        permanent: true,
      },
      {
        source: '/tours/:id/hire',
        destination: '/operations/:id/hire',
        permanent: true,
      },
      {
        source: '/tours/:id/edit',
        destination: '/operations/:id/edit',
        permanent: true,
      },
      // tour-wide retired; content folds into the operations landing.
      {
        source: '/tours/:id/tour-wide',
        destination: '/operations/:id',
        permanent: true,
      },

      // ===== Budget =====
      {
        source: '/tours/:id/budget/settlement',
        destination: '/budget/:id/settlement',
        permanent: true,
      },
      {
        source: '/tours/:id/budget',
        destination: '/budget/:id',
        permanent: true,
      },

      // ===== Advance =====
      {
        source: '/tours/:id/advance/:routingId',
        destination: '/advance/:id/:routingId',
        permanent: true,
      },
      {
        source: '/tours/:id/advance',
        destination: '/advance/:id',
        permanent: true,
      },

      // ===== Operations landing (catch-all for /tours/:id) =====
      // /tours/[id]/summary and /tours/[id]/overview both fold into
      // /operations/[id] per Adam's decision #11.
      {
        source: '/tours/:id/summary',
        destination: '/operations/:id',
        permanent: true,
      },
      {
        source: '/tours/:id/overview',
        destination: '/operations/:id',
        permanent: true,
      },
      {
        // Constrain :id to a UUID so a STATIC segment (e.g. /tours/create) is not
        // mis-301'd to /operations/<segment> → 404. This bare rule was the create
        // blocker: /tours/create matched :id='create' and redirected to a page that
        // doesn't exist. (301s cache hard — test the fix in incognito / after a
        // cache clear.) The suffixed /tours/:id/* rules need a real path segment,
        // so only this bare one needed constraining.
        source: '/tours/:id([0-9a-fA-F-]{36})',
        destination: '/operations/:id',
        permanent: true,
      },
      {
        // Nav & entry fixpack item 5 — the bare /tours list page is a legacy
        // surface (Tier-1 IA is /artists). Every /tours/:id* URL already
        // redirects; this was the one gap. Send /tours → /artists.
        source: '/tours',
        destination: '/artists',
        permanent: true,
      },

      /* ===== Library dropdown contents → new homes =====
         Library retired (decision #4) and its subpaths were pointed at the
         surfaces that replaced them. S-4a audited every destination against the
         filesystem, which is the check nobody did when these were written:

         DELETED, because their destinations were never built. A redirect into a
         404 is worse than no redirect — the user lands on an error page and the
         URL bar blames a route that doesn't exist, so nobody can tell whether
         the page died or the redirect lied. All three now fall through to the
         `/library/:rest*` catch-all below and land on home, which is the honest
         answer for a retired section:
           · /library/rider-packs/:rest*  → /operations/:rest*
             (fed a PACK id into a TOUR id slot — notFound, every time)
           · /library/deal-memos/:rest*   → /budget/deal-memos/:rest*
             (no such route; deal memos live on the artist Production and
              Financials surfaces, and on /m/deal-memos)
           · /library/templates/:rest*    → /templates/:rest*
             (no such route; the template editor is a component launched from
              the export buttons, not a page)

         KEPT but corrected — these had real destinations and only the `:rest*`
         tail was wrong, so they get a specific target rather than the catch-all. */
      {
        // Was → /account/rental/:rest*, which redirects again to /equipment.
        // One hop instead of two, and it survives /account/rental being deleted.
        source: '/library/gear/:rest*',
        destination: '/equipment',
        permanent: true,
      },
      {
        // /venues/[id] does not exist — only the list does.
        source: '/library/venues/:rest*',
        destination: '/venues',
        permanent: true,
      },
      // /library/performance retires entirely (decision #5).
      {
        source: '/library/performance/:rest*',
        destination: '/',
        permanent: true,
      },
      // bare /library/* → home
      {
        source: '/library/:rest*',
        destination: '/',
        permanent: true,
      },

      // ===== Dashboard retires =====
      // Decision: /dashboard folds into / (artist picker / home).
      {
        source: '/dashboard',
        destination: '/',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;

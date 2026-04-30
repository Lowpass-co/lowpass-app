import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Supabase storage — avatars and any other workspace-uploaded assets.
      { protocol: 'https', hostname: '**.supabase.co' },
      // Google OAuth avatars.
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    ],
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
        source: '/tours/:id',
        destination: '/operations/:id',
        permanent: true,
      },

      // ===== Library dropdown contents → new homes =====
      // Per decision #4: Library retires; subpaths migrate.
      {
        source: '/library/rider-packs/:rest*',
        destination: '/operations/:rest*',
        permanent: true,
      },
      {
        source: '/library/deal-memos/:rest*',
        destination: '/budget/deal-memos/:rest*',
        permanent: true,
      },
      {
        source: '/library/gear/:rest*',
        destination: '/account/rental/:rest*',
        permanent: true,
      },
      {
        source: '/library/templates/:rest*',
        destination: '/templates/:rest*',
        permanent: true,
      },
      {
        source: '/library/venues/:rest*',
        destination: '/venues/:rest*',
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

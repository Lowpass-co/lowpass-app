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
};

export default nextConfig;

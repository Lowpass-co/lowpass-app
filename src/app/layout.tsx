/* ============================================
   LOWPASS — Root Layout

   Top-level layout for the entire app.
   Sets up fonts, metadata, and global providers.
   ============================================ */

import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { Inter, Montserrat, Barlow_Condensed } from 'next/font/google';
import './globals.css';
import '@/lib/entities';
import { SubmitShortcut } from '@/components/keyboard/SubmitShortcut';

const inter = Inter({
  variable: '--font-geist-sans',
  subsets: ['latin'],
  display: 'swap',
});

const montserrat = Montserrat({
  variable: '--font-montserrat',
  subsets: ['latin'],
  display: 'swap',
});

// Stage E · §3 — the display face: Barlow Condensed 600 (uppercase page titles,
// artist/tour/card names). Exposed as --font-condensed.
const barlowCondensed = Barlow_Condensed({
  variable: '--font-condensed',
  weight: ['500', '600', '700'],
  subsets: ['latin'],
  display: 'swap',
});

/** Link previews (WhatsApp, iMessage, Slack) need the og:image as an ABSOLUTE
 *  URL (the image is src/app/opengraph-image.png). Its base is the address the
 *  page was opened on — that host is by definition one that serves this app —
 *  else NEXT_PUBLIC_APP_URL, else Next's default. Host FIRST (Nov 2026): with
 *  the env first, production still pointed every preview at
 *  lowpass-app.vercel.app, which serves nothing (DEPLOYMENT_NOT_FOUND); Next's
 *  own default on Vercel is that same dead address. */
async function siteUrl(): Promise<URL | undefined> {
  try {
    const h = await headers();
    const host = h.get('x-forwarded-host') ?? h.get('host');
    if (host) {
      const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
      return new URL(`${proto.split(',')[0].trim()}://${host.split(',')[0].trim()}`);
    }
  } catch {
    /* no request (static render) — fall through */
  }
  try {
    return process.env.NEXT_PUBLIC_APP_URL ? new URL(process.env.NEXT_PUBLIC_APP_URL) : undefined;
  } catch {
    return undefined;
  }
}

const baseMetadata: Metadata = {
  title: {
    default: 'Lowpass — Tour Management',
    template: '%s | Lowpass',
  },
  description: 'Advance, budget, and manage tours from one place.',
  openGraph: { siteName: 'Lowpass', type: 'website' },
  manifest: '/manifest.webmanifest',
  themeColor: '#FF4500',
  icons: {
    icon: '/favicon.ico',
    apple: '/icons/icon-192.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Lowpass',
  },
};

export async function generateMetadata(): Promise<Metadata> {
  return { ...baseMetadata, metadataBase: await siteUrl() };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Inline script to prevent dark mode flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('lp-theme');
                  if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                    document.documentElement.classList.add('dark');
                  }
                } catch(e) {}
              })();
            `,
          }}
        />
      </head>
      <body className={`${inter.variable} ${montserrat.variable} ${barlowCondensed.variable} font-sans antialiased`}>
        <SubmitShortcut />
        {children}
      </body>
    </html>
  );
}

/* ============================================
   LOWPASS — Root Layout

   Top-level layout for the entire app.
   Sets up fonts, metadata, and global providers.
   ============================================ */

import type { Metadata } from 'next';
import { Inter, Montserrat, Barlow_Condensed } from 'next/font/google';
import './globals.css';
import '@/lib/entities';

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

export const metadata: Metadata = {
  title: {
    default: 'Lowpass — Tour Management',
    template: '%s | Lowpass',
  },
  description: 'Advance, budget, and manage tours from one place.',
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
        {children}
      </body>
    </html>
  );
}

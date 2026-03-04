/* ============================================
   LOWPASS — Root Layout

   Top-level layout for the entire app.
   Sets up fonts, metadata, and global providers.
   ============================================ */

import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  variable: '--font-geist-sans',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Lowpass — Tour Management',
    template: '%s | Lowpass',
  },
  description: 'Advance, budget, and manage tours from one place.',
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}

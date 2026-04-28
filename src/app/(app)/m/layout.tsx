'use client';

import { MobileDesktopRedirect } from '@/components/mobile/MobileDesktopRedirect';
import { MobileTabBar } from '@/components/mobile/MobileTabBar';

export default function MobileZoneLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-0 pb-16 text-[16px] leading-[1.65] md:pb-0">
      <MobileDesktopRedirect />
      {children}
      <MobileTabBar />
    </div>
  );
}

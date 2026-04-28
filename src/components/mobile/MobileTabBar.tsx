'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Calendar, FileText, FileSignature, Receipt, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';

const tabs = [
  { href: '/m/today', label: 'Today', Icon: Calendar },
  { href: '/m/files', label: 'Files', Icon: FileText },
  { href: '/m/deal-memos', label: 'Deals', Icon: FileSignature },
  { href: '/m/receipt', label: 'Receipt', Icon: Receipt },
  { href: '/profile', label: 'Account', Icon: UserRound },
] as const;

export function MobileTabBar() {
  const pathname = usePathname();
  return (
    <nav
      className={cn(
        'fixed inset-x-0 bottom-0 z-[90] flex border-t border-lp-border bg-lp-surface/98 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden'
      )}
      aria-label="Mobile navigation"
    >
      <ul className="flex w-full items-stretch justify-between gap-0 text-[11px]">
        {tabs.map(({ href, label, Icon }) => {
          let active = pathname === href;
          if (href === '/m/today' && (pathname.startsWith('/m/show') || pathname === '/m/today')) {
            active = true;
          }
          if (href !== '/m/today' && href !== '/profile')
            active = pathname === href || pathname.startsWith(href + '/');
          return (
            <li key={href} className="min-w-0 flex-1">
              <Link
                href={href}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 py-2 font-medium',
                  active ? 'text-lp-orange' : 'text-lp-text-secondary'
                )}
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden />
                <span className="truncate px-0.5">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

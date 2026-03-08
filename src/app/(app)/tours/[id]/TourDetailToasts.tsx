'use client';

import { useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';

export function TourDetailToasts({
  toast,
  routingEmpty,
  children,
}: {
  toast?: string;
  routingEmpty: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { showToast } = useToast();
  const routingRef = useRef<HTMLDivElement>(null);
  const toastShownRef = useRef<string | null>(null);

  useEffect(() => {
    if (!toast || toastShownRef.current === toast) return;
    toastShownRef.current = toast;
    if (toast === 'tour_created') {
      showToast('Tour created! Now add your routing.');
      if (routingEmpty && routingRef.current) {
        routingRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } else if (toast === 'tour_updated') {
      showToast('Tour updated.');
    }
    router.replace(pathname ?? '/tours', { scroll: false });
  }, [toast, pathname, showToast, router, routingEmpty]);

  return (
    <div ref={routingRef}>
      {routingEmpty && (
        <p className="mb-3 text-sm text-lp-text-secondary">
          No routing dates yet. Click Grid or Calendar to start building your route.
        </p>
      )}
      {children}
    </div>
  );
}

/* ============================================
   LOWPASS — Logo Component

   Uses the Lowpass wordmark logo.
   "Low" on top, "pass" on bottom, with the
   signature angular line element.
   ============================================ */

import Image from 'next/image';
import { cn } from '@/lib/utils';

interface LowpassLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
}

export function LowpassLogo({ size = 'md', className }: LowpassLogoProps) {
  const sizes = {
    sm: { width: 80, height: 47 },
    md: { width: 120, height: 70 },
    lg: { width: 180, height: 105 },
  };

  const { width, height } = sizes[size];

  return (
    <div className={cn('flex items-center', className)}>
      <Image
        src="/lowpass-logo.svg"
        alt="Lowpass"
        width={width}
        height={height}
        priority
      />
    </div>
  );
}

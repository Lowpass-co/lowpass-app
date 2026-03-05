/* ============================================
   LOWPASS — Logo Component

   Uses the actual Lowpass wordmark PNG.
   Transparent background, #FF4500 orange.
   ============================================ */

import Image from 'next/image';
import { cn } from '@/lib/utils';

interface LowpassLogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function LowpassLogo({ size = 'md', className }: LowpassLogoProps) {
  const sizes = {
    sm: { width: 62, height: 48 },
    md: { width: 103, height: 80 },
    lg: { width: 180, height: 139 },
  };

  const { width, height } = sizes[size];

  return (
    <div className={cn('flex items-center', className)}>
      <Image
        src="/lowpass-logo.png"
        alt="Lowpass"
        width={width}
        height={height}
        priority
      />
    </div>
  );
}

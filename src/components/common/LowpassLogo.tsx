/* ============================================
   LOWPASS — Logo Component

   SVG logo for Lowpass branding.
   Uses #FF4500 orange as brand colour.
   ============================================ */

import { cn } from '@/lib/utils';

interface LowpassLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
}

export function LowpassLogo({ size = 'md', showText = true, className }: LowpassLogoProps) {
  const sizes = {
    sm: { icon: 24, text: 'text-sm' },
    md: { icon: 32, text: 'text-lg' },
    lg: { icon: 48, text: 'text-2xl' },
  };

  const { icon, text } = sizes[size];

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      {/* LP icon mark — stylised waveform */}
      <svg
        width={icon}
        height={icon}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Low-pass filter waveform — simplified bars */}
        <rect x="4" y="20" width="6" height="16" rx="3" fill="#FF4500" />
        <rect x="14" y="12" width="6" height="24" rx="3" fill="#FF4500" />
        <rect x="24" y="6" width="6" height="36" rx="3" fill="#FF4500" />
        <rect x="34" y="16" width="6" height="20" rx="3" fill="#FF4500" opacity="0.6" />
        {/* The "low pass" — last bar fades, representing filtered signal */}
      </svg>
      {showText && (
        <span className={cn('font-bold tracking-tight text-lp-text', text)}>
          LOWPASS
        </span>
      )}
    </div>
  );
}

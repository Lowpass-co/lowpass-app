'use client';

/* ============================================
   LOWPASS — <Button> canonical primitive
   (UX Audit 2026 — reference template)

   The single source of truth for button interaction across
   Lowpass. Codifies the de-facto variants already in the
   codebase (orange primary, bordered secondary, ghost, danger)
   and bakes in the three states that 157 of 198 button-bearing
   files currently miss:

     - focus-visible ring (keyboard a11y — UX Pro Max
       Accessibility CRITICAL #1; today only 41/198 files
       have any focus treatment)
     - disabled (opacity + not-allowed cursor + aria)
     - loading (spinner + disabled + preserved width — no
       layout shift)

   Variants (visual parity with the existing inline styles
   they replace — see UX_AUDIT_2026.md §3):
     primary    bg-lp-orange / white text         — one per view
     secondary  bordered, surface bg               — default action
     ghost      transparent, hover tint            — toolbar / inline
     danger     red, for destructive confirms      — separated from primary
     link       text-only, underline on hover

   Sizes map to the density-token rhythm:
     sm  →  28px tall   (dense tables / toolbars)
     md  →  36px tall   (default)
     lg  →  44px tall   (primary CTAs; meets 44px touch min)

   Token-clean: every value via var(--lp-…) / var(--color-lp-…).
   No raw hex.
   ============================================ */

import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner, disables the button, preserves width. */
  loading?: boolean;
  /** Optional leading icon (lucide component or any node). */
  leadingIcon?: ReactNode;
  /** Optional trailing icon. */
  trailingIcon?: ReactNode;
  /** Stretch to container width. */
  block?: boolean;
}

/* Base: shared layout + the focus-visible ring every button
   should have. focus-visible (not focus) so mouse clicks don't
   show the ring but keyboard nav does — matches platform
   expectation. transition tuned to the 150ms micro-interaction
   window (UX Pro Max Animation §7). */
const BASE =
  'btn-transition inline-flex items-center justify-center gap-1.5 rounded-lg font-medium ' +
  'whitespace-nowrap select-none outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-[var(--color-lp-orange)] focus-visible:ring-offset-1 ' +
  'focus-visible:ring-offset-[var(--lp-bg)] ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--color-lp-orange)] text-white hover:bg-[var(--color-lp-orange-hover)] ' +
    'active:bg-[var(--color-lp-orange-hover)] cursor-pointer',
  secondary:
    'border border-lp-border bg-lp-surface text-lp-text ' +
    'hover:bg-lp-surface-hover cursor-pointer',
  ghost:
    'bg-transparent text-lp-text-secondary hover:bg-lp-surface-hover hover:text-lp-text ' +
    'cursor-pointer',
  danger:
    'text-white cursor-pointer ' +
    '[background:var(--color-lp-error)] hover:opacity-90',
  link:
    'bg-transparent p-0 text-[var(--color-lp-orange)] hover:underline cursor-pointer ' +
    'rounded-none',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-xs',
  md: 'h-9 px-3.5 text-sm',
  lg: 'h-11 px-5 text-sm',
};

const ICON_SIZE: Record<ButtonSize, string> = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-4 w-4',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    loading = false,
    leadingIcon,
    trailingIcon,
    block,
    disabled,
    className,
    children,
    type,
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading;
  return (
    <button
      ref={ref}
      // Default to type="button" — the single most common
      // footgun is a button inside a form defaulting to
      // type="submit" and triggering an accidental submit.
      type={type ?? 'button'}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(
        BASE,
        variant !== 'link' && SIZE[size],
        VARIANT[variant],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 className={cn(ICON_SIZE[size], 'animate-spin')} aria-hidden />
      ) : leadingIcon ? (
        <span className={cn('inline-flex shrink-0', ICON_SIZE[size])} aria-hidden>
          {leadingIcon}
        </span>
      ) : null}
      {children}
      {!loading && trailingIcon ? (
        <span className={cn('inline-flex shrink-0', ICON_SIZE[size])} aria-hidden>
          {trailingIcon}
        </span>
      ) : null}
    </button>
  );
});

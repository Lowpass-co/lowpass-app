'use client';

/* ============================================
   LOWPASS — Auth kit (UX Audit 2026 — auth uniformity)

   Shared dark-themed primitives for the login + signup pages
   so the two auth surfaces are identical in field styling,
   button behaviour, and error treatment.

   Why a separate kit (not the app-wide Button/TextInput):
   the auth pages are deliberately dark + full-bleed (globe
   backdrop) regardless of the app theme, so they can't use
   the adaptive --lp-bg tokens that flip to white in light
   mode. This kit pins the dark palette but still routes the
   ONE brand value through the canonical token — fixing the
   pre-audit bug where login hardcoded #ff5500 (5×) instead
   of Lowpass's real brand #FF4500.

   A11y baked in (was missing pre-audit):
     - focus-visible ring on every field + button
     - password show/hide toggle (skill: password-toggle)
     - autoComplete attributes (skill: autofill-support)
     - aria-live error region (skill: aria-live-errors)
     - labels bound via htmlFor/id (skill: form-labels)
   ============================================ */

import { useState } from 'react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/* Dark auth palette — pinned (not adaptive). Brand routes
   through the canonical token so it can never drift from
   #FF4500 again. */
const AUTH = {
  fieldBg: '#18181b',
  fieldBorder: '#27272a',
  fieldBorderHover: '#3f3f46',
  textPrimary: '#e4e4e7',
  textMuted: '#71717a',
  brand: 'var(--color-lp-orange)', // #FF4500 — was hardcoded #ff5500
} as const;

interface AuthFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  id: string;
  label: string;
  /** Renders a show/hide toggle + manages the input type. */
  password?: boolean;
}

export function AuthField({ id, label, password, type, ...rest }: AuthFieldProps) {
  const [reveal, setReveal] = useState(false);
  const resolvedType = password ? (reveal ? 'text' : 'password') : type ?? 'text';
  return (
    <div className="space-y-2">
      {label ? (
        <label
          htmlFor={id}
          className="block text-[13px] font-medium"
          style={{ color: AUTH.textPrimary }}
        >
          {label}
        </label>
      ) : null}
      <div className="relative">
        <input
          id={id}
          type={resolvedType}
          className={cn(
            'w-full rounded-md px-4 py-3 text-sm text-white outline-none transition-colors duration-200',
            password && 'pr-11',
            'placeholder:text-[#71717a]',
            'focus-visible:ring-2',
          )}
          style={{
            background: AUTH.fieldBg,
            border: `1px solid ${AUTH.fieldBorder}`,
            // focus ring color via inline custom prop the class reads
            ['--tw-ring-color' as string]: AUTH.brand,
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = AUTH.brand;
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = AUTH.fieldBorder;
          }}
          {...rest}
        />
        {password ? (
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            aria-label={reveal ? 'Hide password' : 'Show password'}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 transition-colors"
            style={{ color: AUTH.textMuted }}
          >
            {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        ) : null}
      </div>
    </div>
  );
}

type AuthButtonVariant = 'primary' | 'secondary' | 'google';

interface AuthButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: AuthButtonVariant;
  loading?: boolean;
  block?: boolean;
}

export function AuthButton({
  variant = 'primary',
  loading,
  block = true,
  disabled,
  children,
  type,
  ...rest
}: AuthButtonProps) {
  const isDisabled = disabled || loading;
  const base =
    'lp-auth-btn inline-flex items-center justify-center gap-3 rounded-md py-3 text-sm font-medium ' +
    'outline-none focus-visible:ring-2 ' +
    'disabled:cursor-not-allowed disabled:opacity-60';
  return (
    <button
      type={type ?? 'button'}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(base, block && 'w-full')}
      style={
        variant === 'primary'
          ? { background: AUTH.brand, color: '#fff', ['--tw-ring-color' as string]: AUTH.brand }
          : {
              background: AUTH.fieldBg,
              color: AUTH.textPrimary,
              border: `1px solid ${AUTH.fieldBorder}`,
              ['--tw-ring-color' as string]: AUTH.brand,
              paddingLeft: 16,
              paddingRight: 16,
            }
      }
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}

/** Inline brand-orange text link/button used for "Forgot?",
 *  "Back to sign in", footer cross-links. */
export function AuthLink({
  children,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn('text-[13px] font-medium transition-colors hover:underline', className)}
      style={{ color: AUTH.brand }}
      {...rest}
    >
      {children}
    </button>
  );
}

/** aria-live error banner — announces to screen readers
 *  without stealing focus. */
export function AuthError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div
      role="alert"
      aria-live="polite"
      className="mb-5 rounded-lg border px-4 py-3 text-sm"
      style={{
        borderColor: 'rgba(248,113,113,0.4)',
        background: 'rgba(127,29,29,0.5)',
        color: '#f87171',
      }}
    >
      {children}
    </div>
  );
}

export const AUTH_PALETTE = AUTH;

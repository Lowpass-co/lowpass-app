/* ============================================
   LOWPASS — Login Page

   Clean, minimal login with email/password
   and Google OAuth. Lowpass branding.

   Real auth via Supabase.
   Email/password + Google OAuth.
   ============================================ */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import { LowpassLogo } from '@/components/common/LowpassLogo';
import { cn } from '@/lib/utils';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push('/dashboard');
    router.refresh();
  };

  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-lp-bg px-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="text-center">
          <div className="flex justify-center">
            <LowpassLogo size="lg" />
          </div>
          <p className="mt-3 text-sm text-lp-text-secondary">
            Tour management, simplified.
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Login form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-lp-text">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="adam@lowpass.co"
              required
              className={cn(
                'mt-1.5 w-full rounded-lg border border-lp-border bg-lp-surface px-3.5 py-2.5',
                'text-sm text-lp-text placeholder:text-lp-text-tertiary',
                'focus:border-lp-orange focus:ring-1 focus:ring-lp-orange',
                'transition-colors'
              )}
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-lp-text">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className={cn(
                'mt-1.5 w-full rounded-lg border border-lp-border bg-lp-surface px-3.5 py-2.5',
                'text-sm text-lp-text placeholder:text-lp-text-tertiary',
                'focus:border-lp-orange focus:ring-1 focus:ring-lp-orange',
                'transition-colors'
              )}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className={cn(
              'w-full rounded-lg bg-lp-orange px-4 py-2.5',
              'text-sm font-medium text-white',
              'hover:bg-lp-orange-hover transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-lp-border" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-lp-bg px-3 text-lp-text-tertiary">or</span>
          </div>
        </div>

        {/* Google OAuth */}
        <button
          onClick={handleGoogleLogin}
          className={cn(
            'flex w-full items-center justify-center gap-3 rounded-lg',
            'border border-lp-border bg-lp-surface px-4 py-2.5',
            'text-sm font-medium text-lp-text',
            'hover:bg-lp-surface-hover transition-colors'
          )}
        >
          {/* Google icon */}
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
            <path d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 7.294C4.672 5.166 6.656 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>

        {/* Footer */}
        <p className="text-center text-xs text-lp-text-tertiary">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="text-lp-orange hover:text-lp-orange-hover font-medium">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}

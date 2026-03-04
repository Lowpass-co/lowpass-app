/* ============================================
   LOWPASS — Signup Page

   Creates a new account via Supabase.
   After signup, user is redirected to create
   their workspace.
   ============================================ */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-client';
import { LowpassLogo } from '@/components/common/LowpassLogo';
import { cn } from '@/lib/utils';

export default function SignupPage() {
  const supabase = createClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
        },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  };

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-lp-bg px-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="flex justify-center">
            <LowpassLogo size="lg" />
          </div>
          <div className="rounded-xl border border-lp-border bg-lp-surface p-8">
            <h2 className="text-lg font-semibold text-lp-text">Check your email</h2>
            <p className="mt-2 text-sm text-lp-text-secondary">
              We&apos;ve sent a confirmation link to <strong>{email}</strong>.
              Click it to activate your account.
            </p>
          </div>
          <Link href="/login" className="text-sm text-lp-orange hover:text-lp-orange-hover font-medium">
            Back to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-lp-bg px-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="text-center">
          <div className="flex justify-center">
            <LowpassLogo size="lg" />
          </div>
          <p className="mt-3 text-sm text-lp-text-secondary">
            Create your Lowpass account.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Signup form */}
        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-lp-text">
              Full name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Adam Rowley"
              required
              className={cn(
                'mt-1.5 w-full rounded-lg border border-lp-border bg-lp-surface px-3.5 py-2.5',
                'text-sm text-lp-text placeholder:text-lp-text-tertiary',
                'focus:border-lp-orange focus:ring-1 focus:ring-lp-orange focus:outline-none',
                'transition-colors'
              )}
            />
          </div>

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
                'focus:border-lp-orange focus:ring-1 focus:ring-lp-orange focus:outline-none',
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
              minLength={8}
              className={cn(
                'mt-1.5 w-full rounded-lg border border-lp-border bg-lp-surface px-3.5 py-2.5',
                'text-sm text-lp-text placeholder:text-lp-text-tertiary',
                'focus:border-lp-orange focus:ring-1 focus:ring-lp-orange focus:outline-none',
                'transition-colors'
              )}
            />
            <p className="mt-1 text-xs text-lp-text-tertiary">Minimum 8 characters</p>
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
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        {/* Footer */}
        <p className="text-center text-xs text-lp-text-tertiary">
          Already have an account?{' '}
          <Link href="/login" className="text-lp-orange hover:text-lp-orange-hover font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

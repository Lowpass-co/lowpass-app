/* ============================================
   LOWPASS — Signup Page

   Creates a new account via Supabase.
   After signup, user is redirected to create
   their workspace.
   ============================================ */

'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import { AuthShell } from '@/components/auth/AuthShell';
import { AuthField, AuthButton, AuthError } from '@/components/auth/AuthKit';

/* Sprint 10 §5.1 — open-redirect guard mirrors the login
   page's safeNextPath (Sprint 9 §14.3). */
function safeNextPath(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith('/')) return null;
  if (raw.startsWith('//')) return null;
  return raw;
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupPageInner />
    </Suspense>
  );
}

function SignupPageInner() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const nextPath = safeNextPath(searchParams?.get('next') ?? null);
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

    /* Sprint 10 §5.1 — thread `next` through the email-
       confirmation callback so post-confirm redirect lands on
       the deep-link (e.g. /invite/accept?token=...). */
    const callbackParams = new URLSearchParams();
    if (nextPath) callbackParams.set('next', nextPath);
    const callbackUrl = `${window.location.origin}/auth/callback${callbackParams.toString() ? `?${callbackParams.toString()}` : ''}`;

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
        },
        emailRedirectTo: callbackUrl,
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
      <AuthShell>
        <h2 className="mb-8 text-2xl font-medium text-white">Check your email</h2>
        <div
          className="rounded-lg border px-4 py-6 text-sm"
          style={{ borderColor: '#27272a', background: '#18181b', color: '#e4e4e7' }}
        >
          <p className="font-medium">Confirmation sent</p>
          <p className="mt-2" style={{ color: '#71717a' }}>
            We&apos;ve sent a confirmation link to <strong>{email}</strong>. Click it to
            activate your account.
          </p>
          <p className="mt-4">
            <Link
              href="/login"
              className="font-medium transition-colors hover:underline"
              style={{ color: 'var(--color-lp-orange)' }}
            >
              Back to sign in
            </Link>
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h2 className="mb-8 text-2xl font-medium text-white">Create account</h2>

      <AuthError>{error}</AuthError>

      <form onSubmit={handleSignup} className="space-y-5">
        <AuthField
          id="name"
          label="Full name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Jane Smith"
          autoComplete="name"
          required
        />
        <AuthField
          id="email"
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          required
        />
        <div className="space-y-1.5">
          <AuthField
            id="password"
            label="Password"
            password
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
            minLength={8}
            required
          />
          <p className="text-xs" style={{ color: '#71717a' }}>Minimum 8 characters</p>
        </div>

        <div className="pt-2">
          <AuthButton type="submit" loading={loading} block>
            Create account
          </AuthButton>
        </div>
      </form>

      <p className="mt-10 text-center text-[13px]" style={{ color: '#71717a' }}>
        Already have an account?{' '}
        <Link
          href="/login"
          className="font-medium transition-colors hover:underline"
          style={{ color: 'var(--color-lp-orange)' }}
        >
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}

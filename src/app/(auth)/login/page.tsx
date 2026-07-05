/* ============================================
   LOWPASS — Login Page

   Sign-in + inline forgot-password, rendered through the shared
   <AuthShell> (globe backdrop + liquid-glass form card). Real
   auth via Supabase (email/password + Google OAuth). The globe
   backdrop + brand panel now live in <AuthShell> so /login and
   /signup are visually identical.
   ============================================ */

'use client';

import { Suspense, useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import { AuthShell } from '@/components/auth/AuthShell';
import { AuthField, AuthButton, AuthLink, AuthError } from '@/components/auth/AuthKit';

/* Sprint 9 §14.3 — honor `next` query param after auth so the
   invite-accept landing (and any other deep-link redirect)
   picks up where it left off. The `next` value MUST be a same-
   origin path (starts with "/" but not "//") to prevent open
   redirects to attacker-controlled hosts. */
function safeNextPath(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith('/')) return null;
  if (raw.startsWith('//')) return null;
  return raw;
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const nextPath = safeNextPath(searchParams?.get('next') ?? null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const navFailTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (navFailTimerRef.current != null) {
        window.clearTimeout(navFailTimerRef.current);
      }
    };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError(error.message); setLoading(false); return; }
    setTransitioning(true);
    navFailTimerRef.current = window.setTimeout(() => {
      if (window.location.pathname.startsWith('/login')) {
        setTransitioning(false);
        setLoading(false);
        setError('Signed in, but dashboard did not load. Please retry in a moment.');
      }
    }, 4500);
    setTimeout(() => {
      // Nav & entry fixpack item 3 — land directly on /artists (the workspace
      // landing) instead of the retired /dashboard, which double-redirected.
      // /artists itself may single-artist-auto-skip (Salvage #5). ?next= wins.
      router.push(nextPath ?? '/artists');
      router.refresh();
    }, 420);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { setError('Enter your email to reset password.'); return; }
    setForgotLoading(true);
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback`,
    });
    setForgotLoading(false);
    if (error) { setError(error.message); return; }
    setForgotSent(true);
  };

  const handleGoogleLogin = async () => {
    /* Sprint 10 §5.1 — thread `next` through the OAuth
       callback so deep-links (e.g. /invite/accept?token=...)
       survive Google's redirect. The callback route's
       safeNextPath() guard prevents open-redirect abuse. */
    const callbackParams = new URLSearchParams();
    if (nextPath) callbackParams.set('next', nextPath);
    const callbackUrl = `${window.location.origin}/auth/callback${callbackParams.toString() ? `?${callbackParams.toString()}` : ''}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callbackUrl },
    });
    if (error) setError(error.message);
  };

  return (
    <>
      <AuthShell>
        {showForgotPassword ? (
          <>
            <h2 className="mb-8 text-2xl font-semibold text-white">Reset password</h2>
            {forgotSent ? (
              <div
                className="rounded-lg border px-4 py-6 text-sm"
                style={{ borderColor: 'rgba(255,255,255,0.1)', background: 'rgba(24,24,27,0.6)', color: '#e4e4e7' }}
              >
                <p className="font-medium">Check your email</p>
                <p className="mt-2" style={{ color: '#71717a' }}>
                  We sent a reset link to <strong>{email}</strong>. Click the link to set a new password.
                </p>
                <div className="mt-4">
                  <AuthLink onClick={() => { setShowForgotPassword(false); setForgotSent(false); }}>
                    Back to sign in
                  </AuthLink>
                </div>
              </div>
            ) : (
              <>
                <AuthError>{error}</AuthError>
                <form onSubmit={handleForgotPassword} className="space-y-5">
                  <AuthField
                    id="forgot-email"
                    label="Email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    required
                  />
                  <div className="flex gap-2">
                    <AuthButton type="submit" loading={forgotLoading} block>
                      Send reset link
                    </AuthButton>
                    <AuthButton
                      variant="secondary"
                      block={false}
                      onClick={() => { setShowForgotPassword(false); setError(null); }}
                    >
                      Back
                    </AuthButton>
                  </div>
                </form>
              </>
            )}
          </>
        ) : (
          <>
            <h2 className="mb-8 text-2xl font-semibold text-white">Sign in</h2>

            <AuthError>{error}</AuthError>

            <form onSubmit={handleLogin} className="space-y-5">
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

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-medium" style={{ color: '#e4e4e7' }}>Password</span>
                  <AuthLink className="text-[12px]" onClick={() => setShowForgotPassword(true)}>
                    Forgot?
                  </AuthLink>
                </div>
                <AuthField
                  id="password"
                  label=""
                  aria-label="Password"
                  password
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
              </div>

              <div className="pt-2">
                <AuthButton type="submit" loading={loading} block>
                  Sign in
                </AuthButton>
              </div>
            </form>

            {/* Divider */}
            <div className="my-8 flex items-center gap-4">
              <div className="flex-1 border-t" style={{ borderColor: 'rgba(255,255,255,0.1)' }} />
              <span className="text-[13px]" style={{ color: '#71717a' }}>or</span>
              <div className="flex-1 border-t" style={{ borderColor: 'rgba(255,255,255,0.1)' }} />
            </div>

            {/* Google */}
            <AuthButton variant="secondary" onClick={handleGoogleLogin} block>
              <svg viewBox="0 0 24 24" width="18" height="18">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </AuthButton>

            <p className="mt-10 text-center text-[13px]" style={{ color: '#71717a' }}>
              Don&apos;t have an account?{' '}
              <Link
                href="/signup"
                className="font-medium transition-colors hover:underline"
                style={{ color: 'var(--color-lp-orange)' }}
              >
                Sign up
              </Link>
            </p>
          </>
        )}
      </AuthShell>

      {/* Zoom-out transition overlay after a successful sign-in. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-50 transition-opacity duration-[400ms] ease-out"
        style={{
          opacity: transitioning ? 1 : 0,
          visibility: transitioning ? 'visible' : 'hidden',
          background: '#0a0a0a',
        }}
      >
        <div
          className="h-full w-full transition-transform duration-[400ms] ease-out"
          style={{ transform: transitioning ? 'scale(1.15)' : 'scale(0.98)', background: '#0a0a0a' }}
        />
      </div>
    </>
  );
}

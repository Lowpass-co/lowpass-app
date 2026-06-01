/* ============================================
   LOWPASS — Login Page

   Split layout: animated globe sidebar + login form.
   Real auth via Supabase (email/password + Google OAuth).
   ============================================ */

'use client';

import { Suspense, useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import { LowpassLogo } from '@/components/common/LowpassLogo';
import { cn } from '@/lib/utils';
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
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Animated globe
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let angle = 0;
    const TILT = 0.22;
    const LATS = [-75, -60, -45, -30, -15, 0, 15, 30, 45, 60, 75];
    const LONS = 18;
    let W = 0, H = 0, cx = 0, cy = 0, R = 0;

    function resize() {
      W = canvas!.width = window.innerWidth;
      H = canvas!.height = window.innerHeight;
      cx = W * 0.36; cy = H / 2;
      R = H * 0.68;
    }
    window.addEventListener('resize', resize);
    resize();

    function proj(lat: number, lon: number, rot: number) {
      const phi = (90 - lat) * Math.PI / 180;
      const lam = (lon + rot * 180 / Math.PI) * Math.PI / 180;
      const x = Math.sin(phi) * Math.cos(lam);
      const y = Math.cos(phi);
      const z = Math.sin(phi) * Math.sin(lam);
      const cosT = Math.cos(TILT), sinT = Math.sin(TILT);
      const y2 = y * cosT - z * sinT;
      const z2 = y * sinT + z * cosT;
      return { sx: cx + x * R, sy: cy + y2 * R, z: z2 };
    }

    function drawLat(lat: number) {
      ctx!.beginPath();
      let first = true;
      for (let i = 0; i <= 120; i++) {
        const p = proj(lat, (i / 120) * 360, angle);
        if (first) { ctx!.moveTo(p.sx, p.sy); first = false; } else ctx!.lineTo(p.sx, p.sy);
      }
      ctx!.strokeStyle = 'rgba(255,80,0,0.18)';
      ctx!.lineWidth = 2.2;
      ctx!.stroke();
    }

    function drawLon(lon: number) {
      ctx!.beginPath();
      let first = true;
      for (let i = 0; i <= 120; i++) {
        const p = proj(-90 + (i / 120) * 180, lon, angle);
        if (first) { ctx!.moveTo(p.sx, p.sy); first = false; } else ctx!.lineTo(p.sx, p.sy);
      }
      ctx!.strokeStyle = 'rgba(255,80,0,0.14)';
      ctx!.lineWidth = 2.2;
      ctx!.stroke();
    }

    function drawDots() {
      for (let li = 0; li < LATS.length; li++) {
        for (let lni = 0; lni < LONS; lni++) {
          const p = proj(LATS[li], lni * (360 / LONS), angle);
          if (p.z < -0.05) continue;
          const a = (p.z + 1) / 2;
          ctx!.beginPath();
          ctx!.arc(p.sx, p.sy, 1.6 * a, 0, Math.PI * 2);
          ctx!.fillStyle = `rgba(255,80,0,${a * 0.5})`;
          ctx!.fill();
        }
      }
    }

    function draw() {
      ctx!.clearRect(0, 0, W, H);
      const bg = ctx!.createRadialGradient(cx, cy, 0, cx, cy, R * 1.3);
      bg.addColorStop(0, 'rgba(255,70,0,0.05)');
      bg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx!.fillStyle = bg; ctx!.fillRect(0, 0, W, H);
      for (let i = 0; i < LATS.length; i++) drawLat(LATS[i]);
      for (let i = 0; i < LONS; i++) drawLon(i * (360 / LONS));
      drawDots();
      ctx!.beginPath();
      ctx!.arc(cx, cy, R, 0, Math.PI * 2);
      ctx!.strokeStyle = 'rgba(255,80,0,0.22)';
      ctx!.lineWidth = 2.2;
      ctx!.stroke();
      const vig = ctx!.createRadialGradient(cx, cy, R * 0.3, cx, cy, R * 1.5);
      vig.addColorStop(0, 'rgba(10,10,10,0)');
      vig.addColorStop(1, 'rgba(10,10,10,0.97)');
      ctx!.fillStyle = vig; ctx!.fillRect(0, 0, W, H);
      angle += 0.0015;
      animId = requestAnimationFrame(draw);
    }
    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

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
      router.push(nextPath ?? '/dashboard');
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
    <div className="relative h-screen w-full overflow-hidden" style={{ background: '#0a0a0a', color: '#fff' }}>

      {/* Full-screen globe backdrop */}
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" style={{ zIndex: 0 }} />
      {/* Fade globe out toward the right so it doesn't bleed into the form */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'linear-gradient(to right, rgba(10,10,10,0) 25%, rgba(10,10,10,0.75) 55%, rgba(10,10,10,0.97) 100%)', zIndex: 1 }}
      />

      {/* Zoom-out transition overlay (after successful login) */}
      <div
        className={cn(
          'pointer-events-none fixed inset-0 z-50 flex items-center justify-center',
          'transition-all duration-[400ms] ease-out'
        )}
        style={{
          opacity: transitioning ? 1 : 0,
          visibility: transitioning ? 'visible' : 'hidden',
          background: '#0a0a0a',
        }}
      >
        <div
          className="h-full w-full transition-transform duration-[400ms] ease-out"
          style={{
            transform: transitioning ? 'scale(1.15)' : 'scale(0.98)',
            background: '#0a0a0a',
          }}
        />
      </div>

      {/* Content layer */}
      <div
        className={cn(
          'absolute inset-0 flex transition-all duration-300 ease-out',
          transitioning && 'scale-95 opacity-0'
        )}
        style={{ zIndex: 10 }}
      >

        {/* Logo + strapline */}
        <div className="flex w-[45%] shrink-0 flex-col items-center justify-center px-16">
          <div style={{ transform: 'scale(1.18)', transformOrigin: 'center' }}>
            <LowpassLogo size="lg" />
          </div>
          <p style={{ color: '#fff', textAlign: 'center', fontSize: '15px', fontWeight: 400, letterSpacing: '0.2em', textTransform: 'uppercase', lineHeight: 2, marginTop: '2.5rem' }}>
            Tour Management.<br />Simplified.
          </p>
        </div>

        {/* Login form or Forgot password */}
        <main className="flex flex-1 flex-col items-center justify-center px-6">
        <div className="w-full max-w-[400px]">
          {showForgotPassword ? (
            <>
              <h2 className="mb-8 text-2xl font-medium text-white">Reset password</h2>
              {forgotSent ? (
                <div className="rounded-lg border border-[#27272a] bg-[#18181b] px-4 py-6 text-sm" style={{ color: '#e4e4e7' }}>
                  <p className="font-medium">Check your email</p>
                  <p className="mt-2 text-[#71717a]">
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
          <h2 className="mb-8 text-2xl font-medium text-white">Sign in</h2>

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
            <div className="flex-1 border-t border-[#27272a]" />
            <span className="text-[13px]" style={{ color: '#71717a' }}>or</span>
            <div className="flex-1 border-t border-[#27272a]" />
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
        </div>
        </main>

      </div>
    </div>
  );
}

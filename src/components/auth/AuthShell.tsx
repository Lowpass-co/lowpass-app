'use client';

/* ============================================
   LOWPASS — <AuthShell> (UX Audit 2026 — auth uniformity)

   Shared chrome for /login + /signup so the two auth pages
   are layout-identical (pre-audit, login was a dark globe
   split-page while signup was a plain adaptive card — not
   uniform). Renders:

     - animated globe backdrop (extracted verbatim from the
       old login page)
     - right-fade gradient so the globe doesn't bleed into
       the form
     - split layout: brand panel (logo + strapline) left,
       {children} form right

   prefers-reduced-motion: the globe animation is paused when
   the user requests reduced motion (skill: reduced-motion).
   ============================================ */

import { useEffect, useRef } from 'react';
import { LowpassLogo } from '@/components/common/LowpassLogo';

export function AuthShell({ children }: { children: React.ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    let animId = 0;
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
      if (!reduceMotion) {
        angle += 0.0015;
        animId = requestAnimationFrame(draw);
      }
    }
    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <div className="relative h-screen w-full overflow-hidden" style={{ background: '#0a0a0a', color: '#fff' }}>
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" style={{ zIndex: 0 }} />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(to right, rgba(10,10,10,0) 25%, rgba(10,10,10,0.75) 55%, rgba(10,10,10,0.97) 100%)',
          zIndex: 1,
        }}
      />
      <div className="absolute inset-0 flex" style={{ zIndex: 10 }}>
        {/* Brand panel — fades + rises in on load. */}
        <div className="lp-auth-rise hidden w-[45%] shrink-0 flex-col items-center justify-center px-16 md:flex">
          <div style={{ transform: 'scale(1.18)', transformOrigin: 'center' }}>
            <LowpassLogo size="lg" />
          </div>
          <p
            style={{
              color: '#fff',
              textAlign: 'center',
              fontSize: '15px',
              fontWeight: 400,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              lineHeight: 2,
              marginTop: '2.5rem',
            }}
          >
            Tour Management.<br />Simplified.
          </p>
          {/* thin brand accent under the strapline */}
          <span
            aria-hidden
            className="mt-8 block h-px w-16"
            style={{
              background:
                'linear-gradient(90deg, transparent, var(--color-lp-orange), transparent)',
            }}
          />
        </div>
        {/* Form slot — glass card on a soft brand aurora, staggered in. */}
        <main className="flex flex-1 flex-col items-center justify-center px-6 py-10">
          <div className="relative w-full max-w-[420px]">
            <div
              aria-hidden
              className="lp-auth-aurora pointer-events-none absolute -inset-12 -z-10"
              style={{
                background:
                  'radial-gradient(58% 50% at 50% 38%, color-mix(in srgb, var(--color-lp-orange) 22%, transparent), transparent 72%)',
                filter: 'blur(44px)',
              }}
            />
            <div className="lp-auth-card lp-auth-rise lp-auth-rise-d1 p-8 sm:p-10">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}

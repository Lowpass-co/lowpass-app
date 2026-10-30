/* The email-confirmation landing works for both link styles (Oct 2026: a
   sign-up confirmation 404'd), and never redirects off-site. */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const exchange = vi.fn();
const verify = vi.fn();
vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({ auth: { exchangeCodeForSession: exchange, verifyOtp: verify } }),
}));

const callback = await import('./route');
const confirm = await import('../confirm/route');
const loc = (r: Response) => r.headers.get('location');

beforeEach(() => {
  exchange.mockReset().mockResolvedValue({ error: null });
  verify.mockReset().mockResolvedValue({ error: null });
});

describe('auth landing', () => {
  it('a PKCE code signs in and goes to next', async () => {
    const r = await callback.GET(new Request('https://app.test/auth/callback?code=abc&next=/artists'));
    expect(exchange).toHaveBeenCalledWith('abc');
    expect(loc(r)).toBe('https://app.test/artists');
  });

  it('a token-hash sign-up link at /auth/confirm is verified', async () => {
    const r = await confirm.GET(new Request('https://app.test/auth/confirm?token_hash=th&type=signup'));
    expect(verify).toHaveBeenCalledWith({ type: 'signup', token_hash: 'th' });
    expect(loc(r)).toBe('https://app.test/');
  });

  it('a failed or unknown link goes to login with an error', async () => {
    verify.mockResolvedValue({ error: { message: 'expired' } });
    expect(loc(await confirm.GET(new Request('https://app.test/auth/confirm?token_hash=th&type=signup')))).toBe('https://app.test/login?error=auth_callback_failed');
    expect(loc(await confirm.GET(new Request('https://app.test/auth/confirm?token_hash=th&type=bogus')))).toBe('https://app.test/login?error=auth_callback_failed');
  });

  it('never redirects to another site', async () => {
    const r = await callback.GET(new Request('https://app.test/auth/callback?code=abc&next=//evil.com'));
    expect(loc(r)).toBe('https://app.test/');
  });
});

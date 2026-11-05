import { describe, expect, it } from 'vitest';
import { authLinkForward } from './proxy';

const f = (u: string) => authLinkForward(new URL(u))?.toString() ?? null;

describe('authLinkForward — email links that land on the home page', () => {
  it('sends a PKCE code from / to /auth/callback, keeping every param', () => {
    expect(f('https://app.example.com/?code=abc123')).toBe('https://app.example.com/auth/callback?code=abc123');
    expect(f('https://app.example.com/?code=abc&next=%2Fartists')).toBe('https://app.example.com/auth/callback?code=abc&next=%2Fartists');
  });
  it('sends a token_hash + type from / to /auth/callback', () => {
    expect(f('https://app.example.com/?token_hash=th&type=signup')).toBe('https://app.example.com/auth/callback?token_hash=th&type=signup');
  });
  it('leaves everything else alone', () => {
    expect(f('https://app.example.com/')).toBeNull();
    expect(f('https://app.example.com/?token_hash=th')).toBeNull(); // no type
    expect(f('https://app.example.com/artists?code=abc')).toBeNull(); // not the root
    expect(f('https://app.example.com/auth/callback?code=abc')).toBeNull(); // already there
  });
});

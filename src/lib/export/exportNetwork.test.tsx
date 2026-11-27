/* Exports and the network (Nov 2026 — security).

   An artist's logo URL is a stored string anyone with artist edit can set, so
   the export must never fetch it raw (SSRF), and the PDF renderer must not
   fetch anything the HTML points at. */

import { describe, expect, it } from 'vitest';
import { fetchLogoDataUri, logoBytesDataUri } from '@/lib/export/logo';
import { rendererMayLoad } from '@/lib/rider-packs/puppeteer';

describe('fetchLogoDataUri', () => {
  it.each([
    'http://169.254.169.254/latest/meta-data/',
    'http://127.0.0.1:3000/api/secret',
    'http://localhost/logo.png',
    'http://10.0.0.5/logo.png',
    'http://[::1]/logo.png',
    'file:///etc/passwd',
    'javascript:alert(1)',
  ])('refuses %s without fetching it', async (url) => {
    expect(await fetchLogoDataUri(url)).toBeNull();
  });

  it('empty → null', async () => {
    expect(await fetchLogoDataUri(null)).toBeNull();
    expect(await fetchLogoDataUri('')).toBeNull();
  });
});

describe('logoBytesDataUri', () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  it('names the type from the bytes', () => {
    expect(logoBytesDataUri(PNG)).toMatch(/^data:image\/png;base64,/);
  });
  it('refuses SVG / HTML / empty / oversized', () => {
    expect(logoBytesDataUri(new TextEncoder().encode('<svg onload="x()"></svg>'))).toBeNull();
    expect(logoBytesDataUri(new TextEncoder().encode('<html>'))).toBeNull();
    expect(logoBytesDataUri(new Uint8Array())).toBeNull();
    const big = new Uint8Array(3_000_001);
    big.set(PNG);
    expect(logoBytesDataUri(big)).toBeNull();
  });
});

describe('rendererMayLoad', () => {
  it('inline only by default', () => {
    expect(rendererMayLoad('data:image/png;base64,AAAA')).toBe(true);
    expect(rendererMayLoad('about:blank')).toBe(true);
    expect(rendererMayLoad('blob:https://x/1')).toBe(true);
    expect(rendererMayLoad('https://example.com/logo.png')).toBe(false);
    expect(rendererMayLoad('http://169.254.169.254/')).toBe(false);
    expect(rendererMayLoad('file:///etc/passwd')).toBe(false);
  });
  it('an allowed prefix opens exactly that prefix', () => {
    const allow = ['https://abc.supabase.co/storage/v1/object/'];
    expect(rendererMayLoad('https://abc.supabase.co/storage/v1/object/sign/x?token=1', allow)).toBe(true);
    expect(rendererMayLoad('https://abc.supabase.co/rest/v1/tours', allow)).toBe(false);
    expect(rendererMayLoad('https://abc.supabase.co.evil.com/storage/v1/object/x', allow)).toBe(false);
  });
});

/** @vitest-environment node */
import http from 'node:http';
import zlib from 'node:zlib';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FetchRefused, checkUrl, isPublicAddress, safeFetch } from './safeFetch';

describe('which addresses are public', () => {
  it('refuses every private, local, reserved or wrapped address', () => {
    const blocked = [
      '127.0.0.1', '127.255.0.9', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '100.127.255.254',
      '0.0.0.0', '192.0.0.8', '192.0.2.4', '198.18.0.1', '198.51.100.7', '203.0.113.9', '224.0.0.1', '240.0.0.1', '255.255.255.255',
      '::', '::1', 'fe80::1', 'febf::1', 'fc00::1', 'fd12:3456::1', 'ff02::1', '2001:db8::1', '2001::1', '100::1',
      '::ffff:127.0.0.1', '::ffff:10.0.0.1', '::ffff:a9fe:a9fe', '::127.0.0.1', '64:ff9b::a00:1', '2002:a00:1::',
      'localhost', 'not an ip', '',
    ];
    for (const ip of blocked) expect([ip, isPublicAddress(ip)]).toEqual([ip, false]);
  });

  it('lets ordinary internet addresses through, wrapped or not', () => {
    const open = ['8.8.8.8', '1.1.1.1', '172.32.0.1', '100.128.0.1', '192.169.1.1', '2606:4700:4700::1111', '2a00:1450:4009:81f::200e', '::ffff:8.8.8.8', '64:ff9b::808:808', '2002:808:808::1'];
    for (const ip of open) expect([ip, isPublicAddress(ip)]).toEqual([ip, true]);
  });
});

describe('the link itself', () => {
  it('web links on their normal ports only, no passwords', () => {
    expect(checkUrl('https://www.thomann.de/gb/shure_sm57.htm').hostname).toBe('www.thomann.de');
    expect(checkUrl('https://shop.example.com:443/x').hostname).toBe('shop.example.com');
    for (const bad of ['ftp://x.com/a', 'file:///etc/passwd', 'javascript:alert(1)', 'https://u:p@x.com/', 'https://x.com:8443/', 'http://x.com:22/', 'nope']) {
      expect(() => checkUrl(bad)).toThrow(FetchRefused);
    }
  });

  it('refuses before connecting when the name points inside', async () => {
    const inside = safeFetch('https://shop.test/p', { maxBytes: 1000, accept: '*/*' }, { resolve: async () => [{ address: '10.0.0.5', family: 4 }] });
    await expect(inside).rejects.toThrow(/won’t fetch from/);
    // One private answer among public ones is enough to refuse (DNS can rotate).
    const mixed = safeFetch('https://shop.test/p', { maxBytes: 1000, accept: '*/*' }, { resolve: async () => [{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }] });
    await expect(mixed).rejects.toThrow(/won’t fetch from/);
    await expect(safeFetch('http://169.254.169.254/latest/meta-data', { maxBytes: 1000, accept: '*/*' })).rejects.toThrow(/won’t fetch from/);
    await expect(safeFetch('http://[::1]/', { maxBytes: 1000, accept: '*/*' })).rejects.toThrow(/won’t fetch from/);
  });
});

describe('fetching (a local server standing in for the internet)', () => {
  let server: http.Server;
  let port = 0;
  let lastHost = '';

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      lastHost = req.headers.host ?? '';
      const at = (p: string) => `http://shop.test:${port}${p}`;
      switch (req.url) {
        case '/page':
          res.writeHead(200, { 'content-type': 'text/html' }).end('<html><head><meta property="og:image" content="/i.jpg"></head></html>');
          return;
        case '/hop':
          res.writeHead(302, { location: at('/page') }).end();
          return;
        case '/inside':
          res.writeHead(302, { location: `http://evil.test:${port}/secret` }).end();
          return;
        case '/odd-port':
          res.writeHead(301, { location: 'http://shop.test:6379/' }).end();
          return;
        case '/loop':
          res.writeHead(302, { location: at('/loop') }).end();
          return;
        case '/big':
          res.writeHead(200, { 'content-type': 'text/html' }).end('x'.repeat(200_000));
          return;
        case '/bomb':
          res.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'gzip' }).end(zlib.gzipSync(Buffer.alloc(5_000_000)));
          return;
        case '/zipped':
          res.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'gzip' }).end(zlib.gzipSync(Buffer.from('<title>Hi</title>')));
          return;
        case '/blocked':
          res.writeHead(403).end('no bots');
          return;
        case '/slow':
          return; // never answers
        default:
          res.writeHead(404).end();
      }
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => {
    server.closeAllConnections?.();
    server.close();
  });

  // shop.test → the local server (allowed for the test); evil.test → private.
  const deps = () => ({
    testPort: port,
    resolve: async (host: string) => [{ address: host === 'shop.test' ? '127.0.0.1' : '10.0.0.9', family: 4 }],
    isAllowed: (ip: string) => ip === '127.0.0.1' || isPublicAddress(ip),
  });
  const get = (path: string, maxBytes = 100_000, timeoutMs = 3000) => safeFetch(`http://shop.test:${port}${path}`, { maxBytes, accept: 'text/html', timeoutMs }, deps());

  it('connects to the checked address but speaks to the site by name', async () => {
    const r = await get('/page');
    expect(r.status).toBe(200);
    expect(new TextDecoder().decode(r.body)).toContain('og:image');
    expect(lastHost).toBe(`shop.test:${port}`);
  });

  it('follows a redirect, checking where it goes', async () => {
    expect((await get('/hop')).url).toBe(`http://shop.test:${port}/page`);
    await expect(get('/inside')).rejects.toThrow(/won’t fetch from/);
    await expect(get('/odd-port')).rejects.toThrow(/unusual port/);
    await expect(get('/loop')).rejects.toThrow(/too many times/);
  });

  it('stops at the size cap — counted after unzipping', async () => {
    await expect(get('/big', 50_000)).rejects.toThrow(/too big/);
    await expect(get('/bomb', 1_000_000)).rejects.toThrow(/too big/);
    expect(new TextDecoder().decode((await get('/zipped')).body)).toBe('<title>Hi</title>');
  });

  it('gives up on a slow site, and says why a shop refused', async () => {
    await expect(get('/slow', 1000, 300)).rejects.toThrow(/too long/);
    await expect(get('/blocked')).rejects.toThrow(/doesn’t let Lowpass read/);
  });
});

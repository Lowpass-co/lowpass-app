/* ============================================
   LOWPASS — fetching a URL a user typed, safely (Nov 2026)

   The only server-side fetch of a user-supplied URL (a shop link, to take its
   product photo). The server has keys and a private network around it, so:

     · http(s) only, default ports only, no credentials in the URL;
     · the host is resolved HERE and every address must be public — no
       loopback, private, link-local, CGNAT, multicast, reserved, or an IPv6
       form wrapping one of those (mapped / NAT64 / 6to4);
     · the connection is PINNED to the address that was checked (the request's
       `lookup` returns it), so DNS can't answer differently a moment later;
     · redirects are followed by hand (≤ 3), each hop checked the same way;
     · one deadline for the lot, and a byte cap counted AFTER decompression.

   `FetchRefused` carries a sentence fit to show. `deps` is the test seam
   (resolver + address rule); production never passes it.
   ============================================ */

import { lookup as dnsLookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import zlib from 'node:zlib';
import type { Readable } from 'node:stream';

export class FetchRefused extends Error {}

/* ---------- which addresses are public ---------- */

function v4Parts(ip: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const p = m.slice(1).map(Number);
  return p.every((n) => n >= 0 && n <= 255) ? p : null;
}

function v4Public(p: number[]): boolean {
  const [a, b, c] = p;
  if (a === 0 || a === 10 || a === 127) return false; // this network, private, loopback
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT 100.64/10
  if (a === 169 && b === 254) return false; // link-local (cloud metadata lives here)
  if (a === 172 && b >= 16 && b <= 31) return false; // private 172.16/12
  if (a === 192 && b === 168) return false; // private
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false; // IETF / TEST-NET-1
  if (a === 192 && b === 88 && c === 99) return false; // 6to4 relay
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a === 198 && b === 51 && c === 100) return false; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return false; // TEST-NET-3
  if (a >= 224) return false; // multicast, reserved, broadcast
  return true;
}

/** An IPv6 address → its 8 hextets (handles ::, and a trailing dotted IPv4). */
function v6Hextets(ip: string): number[] | null {
  let s = ip.toLowerCase();
  const zone = s.indexOf('%');
  if (zone >= 0) s = s.slice(0, zone);
  let tail: number[] = [];
  const lastColon = s.lastIndexOf(':');
  if (s.slice(lastColon + 1).includes('.')) {
    const v4 = v4Parts(s.slice(lastColon + 1));
    if (!v4) return null;
    tail = [(v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]];
    s = `${s.slice(0, lastColon + 1)}x`;
  }
  const parts = s.split('::');
  if (parts.length > 2) return null;
  const read = (seg: string) => (seg ? seg.split(':').filter((x) => x !== 'x') : []);
  const head = read(parts[0]);
  const rest = parts.length === 2 ? read(parts[1]) : [];
  const want = 8 - tail.length;
  const fill = parts.length === 2 ? want - head.length - rest.length : 0;
  if (fill < 0 || (parts.length === 1 && head.length !== want)) return null;
  const hex = [...head, ...Array(fill).fill('0'), ...rest];
  if (hex.length !== want || hex.some((h) => !/^[0-9a-f]{1,4}$/.test(h))) return null;
  return [...hex.map((h) => parseInt(h, 16)), ...tail];
}

const embeddedV4 = (h: number[], at: number): number[] => [h[at] >> 8, h[at] & 255, h[at + 1] >> 8, h[at + 1] & 255];

export function isPublicAddress(ip: string): boolean {
  const kind = net.isIP(ip);
  if (kind === 4) {
    const p = v4Parts(ip);
    return !!p && v4Public(p);
  }
  if (kind !== 6) return false;
  const h = v6Hextets(ip);
  if (!h) return false;
  if (h.every((x) => x === 0)) return false; // ::
  if (h.slice(0, 7).every((x) => x === 0) && h[7] === 1) return false; // ::1
  if (h.slice(0, 5).every((x) => x === 0) && h[5] === 0xffff) return v4Public(embeddedV4(h, 6)); // ::ffff:a.b.c.d
  if (h.slice(0, 6).every((x) => x === 0)) return false; // ::a.b.c.d (deprecated compat)
  if (h[0] === 0x64 && h[1] === 0xff9b && h.slice(2, 6).every((x) => x === 0)) return v4Public(embeddedV4(h, 6)); // NAT64
  if (h[0] === 0x2002) return v4Public(embeddedV4(h, 1)); // 6to4
  if (h[0] === 0x100 && h.slice(1, 4).every((x) => x === 0)) return false; // discard 100::/64
  if (h[0] === 0x2001 && h[1] < 0x200) return false; // 2001::/23 (Teredo, benchmarking …)
  if (h[0] === 0x2001 && h[1] === 0xdb8) return false; // documentation
  if ((h[0] & 0xfe00) === 0xfc00) return false; // unique local fc00::/7
  if ((h[0] & 0xffc0) === 0xfe80 || (h[0] & 0xffc0) === 0xfec0) return false; // link / site local
  if ((h[0] & 0xff00) === 0xff00) return false; // multicast
  return true;
}

/* ---------- the fetch ---------- */

export interface SafeFetchResult {
  /** Where the content finally came from (after redirects). */
  url: string;
  status: number;
  contentType: string | null;
  body: Uint8Array;
}

export interface SafeFetchDeps {
  resolve?: (host: string) => Promise<{ address: string; family: number }[]>;
  isAllowed?: (address: string) => boolean;
  /** Tests only: one more port allowed (a local test server). */
  testPort?: number;
}

const UA = 'Mozilla/5.0 (compatible; LowpassLinkPreview/1.0; +https://lowpass.app)';

/** A URL a user typed → checked or refused (pure). */
export function checkUrl(raw: string, testPort?: number): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new FetchRefused('That doesn’t look like a web link.');
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new FetchRefused('Only web links (http / https).');
  if (u.username || u.password) throw new FetchRefused('Links with a password in them aren’t fetched.');
  if (u.port && !((u.protocol === 'https:' && u.port === '443') || (u.protocol === 'http:' && u.port === '80') || (testPort !== undefined && u.port === String(testPort)))) {
    throw new FetchRefused('That link uses an unusual port — paste the shop’s normal page link.');
  }
  return u;
}

async function addressFor(u: URL, deps: Required<Pick<SafeFetchDeps, 'resolve' | 'isAllowed'>>): Promise<{ address: string; family: 4 | 6 }> {
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const literal = net.isIP(host);
  const found = literal ? [{ address: host, family: literal }] : await deps.resolve(host).catch(() => [] as { address: string; family: number }[]);
  if (!found.length) throw new FetchRefused('Couldn’t find that website.');
  if (found.some((a) => !deps.isAllowed(a.address))) throw new FetchRefused('That link points somewhere Lowpass won’t fetch from.');
  return { address: found[0].address, family: found[0].family === 6 ? 6 : 4 };
}

function once(u: URL, pin: { address: string; family: 4 | 6 }, accept: string, deadline: number): Promise<http.IncomingMessage> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return Promise.reject(new FetchRefused('That website took too long.'));
  const mod = u.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = mod.request(
      {
        protocol: u.protocol,
        hostname: u.hostname.replace(/^\[|\]$/g, ''),
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: `${u.pathname}${u.search}`,
        method: 'GET',
        headers: { 'User-Agent': UA, Accept: accept, 'Accept-Language': 'en-GB,en;q=0.8', 'Accept-Encoding': 'gzip, deflate, br' },
        servername: net.isIP(u.hostname) ? undefined : u.hostname,
        // Pinned: the connection goes to the address that was checked.
        lookup: ((_host: string, options: { all?: boolean }, cb: (...a: unknown[]) => void) =>
          options?.all ? cb(null, [{ address: pin.address, family: pin.family }]) : cb(null, pin.address, pin.family)) as unknown as typeof dnsLookup,
        timeout: remaining,
      },
      resolve,
    );
    req.on('timeout', () => req.destroy(new FetchRefused('That website took too long.')));
    req.on('error', (e) => reject(e instanceof FetchRefused ? e : new FetchRefused('Couldn’t reach that website.')));
    req.end();
  });
}

function readCapped(res: http.IncomingMessage, maxBytes: number, deadline: number): Promise<Uint8Array> {
  const enc = String(res.headers['content-encoding'] ?? '').toLowerCase();
  let stream: Readable = res;
  if (enc === 'gzip' || enc === 'x-gzip') stream = res.pipe(zlib.createGunzip());
  else if (enc === 'deflate') stream = res.pipe(zlib.createInflate());
  else if (enc === 'br') stream = res.pipe(zlib.createBrotliDecompress());
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const timer = setTimeout(() => fail(new FetchRefused('That website took too long.')), Math.max(0, deadline - Date.now()));
    const fail = (e: Error) => {
      clearTimeout(timer);
      res.destroy();
      stream.destroy();
      reject(e);
    };
    stream.on('data', (c: Buffer) => {
      size += c.length;
      if (size > maxBytes) fail(new FetchRefused('That page or photo is too big.'));
      else chunks.push(c);
    });
    stream.on('end', () => {
      clearTimeout(timer);
      resolve(new Uint8Array(Buffer.concat(chunks)));
    });
    stream.on('error', () => fail(new FetchRefused('Couldn’t read that website.')));
  });
}

export async function safeFetch(
  raw: string,
  opts: { maxBytes: number; accept: string; timeoutMs?: number; maxRedirects?: number },
  deps: SafeFetchDeps = {},
): Promise<SafeFetchResult> {
  const d = {
    resolve: deps.resolve ?? ((host: string) => dnsLookup(host, { all: true, verbatim: true })),
    isAllowed: deps.isAllowed ?? isPublicAddress,
  };
  const deadline = Date.now() + (opts.timeoutMs ?? 8000);
  let u = checkUrl(raw, deps.testPort);
  for (let hop = 0; hop <= (opts.maxRedirects ?? 3); hop++) {
    const pin = await addressFor(u, d);
    const res = await once(u, pin, opts.accept, deadline);
    const status = res.statusCode ?? 0;
    if (status >= 300 && status < 400 && res.headers.location) {
      res.resume();
      let next: URL;
      try {
        next = new URL(res.headers.location, u);
      } catch {
        throw new FetchRefused('That link redirects somewhere broken.');
      }
      u = checkUrl(next.toString(), deps.testPort);
      continue;
    }
    if (status < 200 || status >= 300) {
      res.resume();
      throw new FetchRefused(status === 403 || status === 429 || status === 503 ? 'That shop doesn’t let Lowpass read its pages — add a photo yourself.' : `That page answered ${status}.`);
    }
    const declared = Number(res.headers['content-length']);
    if (Number.isFinite(declared) && declared > opts.maxBytes) {
      res.destroy();
      throw new FetchRefused('That page or photo is too big.');
    }
    const body = await readCapped(res, opts.maxBytes, deadline);
    return { url: u.toString(), status, contentType: (res.headers['content-type'] as string | undefined) ?? null, body };
  }
  throw new FetchRefused('That link redirects too many times.');
}

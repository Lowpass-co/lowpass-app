/* ============================================
   LOWPASS — the product photo on a shop page (pure, Nov 2026)

   A rider's request line can link the exact item. When the TM pastes the
   link, the server fetches the page (safeFetch) and this finds the photo the
   shop itself offers for sharing, in this order:

     1. JSON-LD Product (or ProductGroup …) `image` — the product, by definition
     2. og:image:secure_url · og:image · og:image:url
     3. twitter:image · twitter:image:src
     4. <link rel="image_src">
     5. microdata itemprop="image"

   …and a title (og:title › Product name › twitter:title › <title>).

   No DOM: tags are scanned with bounded regexes (the page is capped at
   1.5 MB before it gets here). Everything returned is an absolute http(s) URL
   resolved against <base href> / the page URL — or null. Nothing here is
   trusted further: the image is fetched through safeFetch and its bytes are
   sniffed before anything is stored.
   ============================================ */

export interface ProductPreview {
  title: string | null;
  image: string | null;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z]{2,8}|#39);/gi, (whole, name: string) => {
    const key = name.toLowerCase();
    if (key in ENTITIES) return ENTITIES[key];
    if (key.startsWith('#x') || key.startsWith('#')) {
      const n = key.startsWith('#x') ? parseInt(key.slice(2), 16) : parseInt(key.slice(1), 10);
      if (Number.isFinite(n) && n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff)) return String.fromCodePoint(n);
    }
    return whole;
  });
}

/** `<meta property="og:image" content="…">` → { property: 'og:image', content: '…' } */
export function readAttrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const inner = tag.replace(/^<[a-z]+/i, '').replace(/\/?>$/, '');
  const re = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(inner))) {
    const name = m[1].toLowerCase();
    if (!(name in out)) out[name] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return out;
}

function tags(html: string, name: 'meta' | 'link' | 'base' | 'img'): Record<string, string>[] {
  const re = new RegExp(`<${name}\\b[^>]{0,4000}>`, 'gi');
  return (html.match(re) ?? []).slice(0, 2000).map(readAttrs);
}

function absolute(raw: string | null | undefined, base: string): string | null {
  const v = (raw ?? '').trim();
  if (!v || v.length > 2000 || /^(data|javascript|blob):/i.test(v)) return null;
  try {
    const u = new URL(v, base);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (u.username || u.password) return null;
    return u.toString();
  } catch {
    return null;
  }
}

const tidy = (s: string | null | undefined): string | null => {
  const t = decodeEntities(String(s ?? '')).replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, 200) : null;
};

const PRODUCT_TYPES = new Set(['product', 'productgroup', 'individualproduct', 'productmodel']);

function isProduct(node: Record<string, unknown>): boolean {
  const t = node['@type'];
  const list = Array.isArray(t) ? t : [t];
  return list.some((x) => typeof x === 'string' && PRODUCT_TYPES.has(x.replace(/^.*[/#:]/, '').toLowerCase()));
}

/** JSON-LD `image`: a string, an ImageObject, or a list of either. */
function firstImage(v: unknown): string | null {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) {
    for (const x of v) {
      const got = firstImage(x);
      if (got) return got;
    }
    return null;
  }
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return firstImage(o.contentUrl ?? o.url ?? null);
  }
  return null;
}

/** Every JSON-LD node on the page, @graph flattened, bounded. */
function jsonLdNodes(html: string): Record<string, unknown>[] {
  const nodes: Record<string, unknown>[] = [];
  const re = /<script\b[^>]{0,500}type\s*=\s*["']?application\/ld\+json["']?[^>]{0,500}>([\s\S]{0,500000}?)<\/script>/gi;
  let m: RegExpExecArray | null;
  let scripts = 0;
  while ((m = re.exec(html)) && scripts++ < 30) {
    let data: unknown;
    try {
      data = JSON.parse(m[1].trim().replace(/^<!--|-->$/g, ''));
    } catch {
      continue;
    }
    const stack: unknown[] = [data];
    while (stack.length && nodes.length < 500) {
      const v = stack.pop();
      if (Array.isArray(v)) stack.push(...v.slice(0, 200));
      else if (v && typeof v === 'object') {
        const o = v as Record<string, unknown>;
        nodes.push(o);
        if (o['@graph']) stack.push(o['@graph']);
        if (o.mainEntity) stack.push(o.mainEntity);
        if (o.hasVariant) stack.push(o.hasVariant);
      }
    }
  }
  return nodes;
}

export function productFromHtml(html: string, pageUrl: string): ProductPreview {
  const metas = tags(html, 'meta');
  const baseTag = tags(html, 'base').find((b) => b.href);
  const base = absolute(baseTag?.href, pageUrl) ?? pageUrl;
  const meta = (...keys: string[]): string | null => {
    for (const k of keys) {
      const hit = metas.find((t) => (t.property ?? t.name ?? '').toLowerCase() === k && t.content?.trim());
      if (hit) return hit.content;
    }
    return null;
  };

  const products = jsonLdNodes(html).filter(isProduct);
  const ldImage = products.map((p) => absolute(firstImage(p.image), base)).find(Boolean) ?? null;
  const ldName = products.map((p) => (typeof p.name === 'string' ? p.name : null)).find(Boolean) ?? null;

  const links = tags(html, 'link');
  const imageSrc = links.find((l) => (l.rel ?? '').toLowerCase().split(/\s+/).includes('image_src'))?.href;
  const microdata =
    metas.find((t) => (t.itemprop ?? '').toLowerCase() === 'image')?.content ??
    tags(html, 'img').find((t) => (t.itemprop ?? '').toLowerCase() === 'image')?.src;

  const image =
    ldImage ??
    absolute(meta('og:image:secure_url'), base) ??
    absolute(meta('og:image'), base) ??
    absolute(meta('og:image:url'), base) ??
    absolute(meta('twitter:image'), base) ??
    absolute(meta('twitter:image:src'), base) ??
    absolute(imageSrc, base) ??
    absolute(microdata, base);

  const titleTag = /<title\b[^>]{0,200}>([\s\S]{0,1000}?)<\/title>/i.exec(html)?.[1];
  const title = tidy(meta('og:title')) ?? tidy(ldName) ?? tidy(meta('twitter:title')) ?? tidy(titleTag);

  return { title, image };
}

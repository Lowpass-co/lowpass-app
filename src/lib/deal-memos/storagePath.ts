/**
 * Deal memo documents may store either:
 * - a storage path `{workspace_id}/{deal_memo_id}/{filename}`, or
 * - a legacy full Supabase public URL containing `/deal-memos/`.
 */

export function resolveDealMemoDocStoragePath(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const t = raw.trim();
  const fromUrl = t.match(/deal-memos\/([^?]+)/);
  if (fromUrl?.[1]) return decodeURIComponent(fromUrl[1]);
  const first = t.split('/')[0] ?? '';
  if (/^[0-9a-f-]{36}$/i.test(first)) return t;
  return t;
}

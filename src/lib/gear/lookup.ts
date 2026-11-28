/* ============================================
   LOWPASS — look an item up online (Nov 2026, Adam: "you should be able to
   google search for an item though to pull retail value, basic info, weight
   and picture")

   The server asks the model, with web search, for one product's facts and a
   photo link; this file holds the question and THE gate for the answer —
   nothing the model says reaches the database or the page unchecked
   (`parseLookup`). It only PROPOSES: the new-item form shows what came back
   and the person saves it.
   ============================================ */

import { CATEGORIES } from '@/components/equipment/types';

export const GEAR_LOOKUP_MODEL = process.env.LP_GEAR_LOOKUP_MODEL || 'claude-sonnet-5-5';
/** Searches the model may run per lookup (each is billed). */
export const GEAR_LOOKUP_MAX_SEARCHES = 3;

export interface GearLookup {
  name: string;
  manufacturer: string | null;
  model: string | null;
  category: (typeof CATEGORIES)[number] | null;
  description: string | null;
  /** New retail price — what it costs to buy today. */
  retail: { amount: number; currency: string } | null;
  weightKg: number | null;
  dimensionsCm: { l: number; w: number; h: number } | null;
  /** A direct link to a product photo (the server copies it). */
  imageUrl: string | null;
  /** Pages the facts came from. */
  sources: string[];
}

export const LOOKUP_SYSTEM = `You look up one piece of professional audio, lighting, video, backline, rigging or power equipment for a rental house's stock list.
Search the web (manufacturer pages first, then major retailers such as Sweetwater, Thomann, B&H, Full Compass). Then answer with ONE JSON object and nothing else:
{
  "name": "the product's usual name, e.g. \\"AKG C414 XLII\\"",
  "manufacturer": "brand or null",
  "model": "model number or null",
  "category": one of ${JSON.stringify(CATEGORIES)} or null,
  "description": "one plain sentence of what it is, max 160 characters, or null",
  "retail": { "amount": number, "currency": "USD|GBP|EUR|…" } — the current NEW retail price from a real listing, or null,
  "weight_kg": number (the product's own weight, converted to kg) or null,
  "dimensions_cm": { "l": number, "w": number, "h": number } or null,
  "image_url": "a direct https link to a clear product photo (jpg/png/webp) from the manufacturer or a retailer, or null",
  "sources": ["https://…", …] — the pages you used
}
Never guess a number you didn't find: use null. If you can't tell which product is meant, answer with the most likely one.`;

export function lookupPrompt(query: string): string {
  return `Look up: ${query.trim().slice(0, 200)}`;
}

const MAX_TEXT = 200;

function text(v: unknown, max = MAX_TEXT): string | null {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
}

function num(v: unknown, min: number, max: number): number | null {
  const n = typeof v === 'string' ? Number(v.replace(/[^0-9.]/g, '')) : Number(v);
  return Number.isFinite(n) && n > min && n <= max ? Math.round(n * 100) / 100 : null;
}

/** https only, no credentials, ≤ 2,000 chars. */
export function cleanHttpsUrl(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 2000) return null;
  try {
    const u = new URL(v.trim());
    if (u.protocol !== 'https:' || u.username || u.password) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** The first {...} in a reply (models sometimes wrap JSON in prose / fences). */
export function jsonOf(reply: string): unknown {
  const start = reply.indexOf('{');
  const end = reply.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(reply.slice(start, end + 1));
  } catch {
    return null;
  }
}

function category(v: unknown): GearLookup['category'] {
  if (typeof v !== 'string') return null;
  const t = v.trim().toLowerCase();
  return CATEGORIES.find((c) => c.toLowerCase() === t) ?? null;
}

/** THE gate: the model's reply → facts we're willing to show, or null. */
export function parseLookup(raw: unknown): GearLookup | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = text(r.name, 120);
  if (!name) return null;
  const retailRaw = r.retail as Record<string, unknown> | null | undefined;
  const amount = retailRaw ? num(retailRaw.amount, 0, 5_000_000) : null;
  const currency = retailRaw && typeof retailRaw.currency === 'string' && /^[A-Za-z]{3}$/.test(retailRaw.currency.trim())
    ? retailRaw.currency.trim().toUpperCase()
    : null;
  const dims = r.dimensions_cm as Record<string, unknown> | null | undefined;
  const l = dims ? num(dims.l, 0, 2000) : null;
  const w = dims ? num(dims.w, 0, 2000) : null;
  const h = dims ? num(dims.h, 0, 2000) : null;
  const sources = Array.isArray(r.sources) ? r.sources.map(cleanHttpsUrl).filter((s): s is string => !!s).slice(0, 5) : [];
  return {
    name,
    manufacturer: text(r.manufacturer, 80),
    model: text(r.model, 80),
    category: category(r.category),
    description: text(r.description, 200),
    retail: amount != null && currency ? { amount, currency } : null,
    weightKg: num(r.weight_kg, 0, 5000),
    dimensionsCm: l != null && w != null && h != null ? { l, w, h } : null,
    imageUrl: cleanHttpsUrl(r.image_url),
    sources,
  };
}

/* ============================================================
   LOWPASS — Gemini text-embedding client (RAG substrate)

   Calls the Google Generative Language API (gemini-embedding-001) over
   REST via fetch — no new npm dependency. The Generative Language API
   rides the SAME Google Cloud project + DPA as the existing Maps/Docs
   keys (Adam's lock, 2026-06-24), so embedding adds no new sub-processor.

   Model / shape confirmed against ai.google.dev/gemini-api/docs/embeddings
   (2026-06-24):
     - model id:  models/gemini-embedding-001
     - batch:     POST /v1beta/models/gemini-embedding-001:batchEmbedContents
                  { requests: [{ model, content:{parts:[{text}]}, taskType,
                                 outputDimensionality }] }
                  → { embeddings: [{ values: number[] }] }
     - single:    POST .../gemini-embedding-001:embedContent
                  { model, content, taskType, outputDimensionality }
                  → { embedding: { values: number[] } }
     - dims:      outputDimensionality=768 (Matryoshka truncation). Cosine
                  similarity is magnitude-invariant, so the truncated (un-
                  normalised) vectors are fine for vector_cosine_ops.
     - taskType:  RETRIEVAL_DOCUMENT for ingestion, RETRIEVAL_QUERY for search.

   Metering: every batch call records ONE ai_usage_events row with
   provider='google', endpoint='ai.embeddings' via logGoogleCall — the
   google provider lane (migration 205), which is request-count limited
   (googleUsage.ts) and explicitly EXCLUDED from the Anthropic dollar-cap.
   ============================================================ */

import { logGoogleCall, type GoogleCallContext } from '@/lib/external/googleUsage';

export const EMBED_MODEL = 'gemini-embedding-001';
export const EMBED_DIM = 768;
/** Provenance string stored on every chunk (rag_chunks.embed_model). */
export const EMBED_MODEL_TAG = `${EMBED_MODEL}@${EMBED_DIM}`;

export type EmbedTaskType = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';

/** Max texts per batchEmbedContents call — keep batches modest so one
 *  network failure re-tries a small slice and metering stays granular. */
const BATCH_SIZE = 64;

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export class EmbeddingConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmbeddingConfigError';
  }
}

function apiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new EmbeddingConfigError('GEMINI_API_KEY is not set');
  }
  return key;
}

interface BatchEmbedResponse {
  embeddings?: Array<{ values?: number[] }>;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function validateVector(values: number[] | undefined): number[] {
  if (!Array.isArray(values) || values.length !== EMBED_DIM) {
    throw new Error(
      `embedding dimension mismatch: expected ${EMBED_DIM}, got ${Array.isArray(values) ? values.length : 'none'}`,
    );
  }
  return values;
}

/**
 * Embed many texts. Returns one vector per input, in order. Batched +
 * metered (one google event per batch). Throws on config/API/dimension
 * error — callers decide: ingestion logs and continues; query surfaces a
 * graceful empty.
 */
export async function embedTexts(
  texts: string[],
  opts: { ctx: GoogleCallContext; taskType?: EmbedTaskType },
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const key = apiKey();
  const taskType = opts.taskType ?? 'RETRIEVAL_DOCUMENT';
  const out: number[][] = [];

  for (const batch of chunk(texts, BATCH_SIZE)) {
    const body = {
      requests: batch.map((text) => ({
        model: `models/${EMBED_MODEL}`,
        content: { parts: [{ text }] },
        taskType,
        outputDimensionality: EMBED_DIM,
      })),
    };
    let res: Response;
    try {
      res = await fetch(`${BASE_URL}/${EMBED_MODEL}:batchEmbedContents?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err) {
      await logGoogleCall(opts.ctx, 'error', err instanceof Error ? err.message : 'fetch failed');
      throw err;
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      await logGoogleCall(opts.ctx, 'error', `HTTP ${res.status}`);
      throw new Error(`Gemini embeddings HTTP ${res.status}: ${detail.slice(0, 200)}`);
    }
    const json = (await res.json()) as BatchEmbedResponse;
    const embeddings = json.embeddings ?? [];
    if (embeddings.length !== batch.length) {
      await logGoogleCall(opts.ctx, 'error', 'embedding count mismatch');
      throw new Error(`Gemini returned ${embeddings.length} embeddings for ${batch.length} inputs`);
    }
    for (const e of embeddings) out.push(validateVector(e.values));
    await logGoogleCall(opts.ctx, 'ok');
  }

  return out;
}

/** Embed a single query string (RETRIEVAL_QUERY task). */
export async function embedQuery(
  text: string,
  opts: { ctx: GoogleCallContext },
): Promise<number[]> {
  const [vec] = await embedTexts([text], { ctx: opts.ctx, taskType: 'RETRIEVAL_QUERY' });
  return vec;
}

/** Format a JS number[] as a pgvector literal, e.g. '[0.1,0.2,...]'. */
export function toVectorLiteral(values: number[]): string {
  return `[${values.join(',')}]`;
}

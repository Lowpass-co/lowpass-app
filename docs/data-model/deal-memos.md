# Deal memos

## Purpose

Deal memos are **financial / contractual records** scoped to a **tour**. They are **not** rider packs and do not reuse `rider_packs`. They normally attach to a single **show** (`routing.id`); they may alternatively be **tour-wide** (`show_id NULL`).

## Schema

Implemented in **`database/migrations/053_deal_memos.sql`**:

- **`deal_memos`** — `workspace_id`, required `tour_id`, optional `show_id` → `routing(id)`.
- **Money**: `fee_*`, `deposit_*`, `settlement_method`.
- **Lifecycle**: `status` enforced `draft \| sent \| pending \| signed \| expired`; optional `sent_at`, `signed_at`, `expires_at`.
- **Document**: `document_url`, `document_filename`; storage bucket **`deal-memos`**, path convention `{workspace_id}/{deal_memo_id}/{filename}`.
- **RLS**: workspace members for CRU; **DELETE** requires **`is_workspace_admin()`**.

## Entity

Registered as **`deal-memo`** in **`src/lib/entities/deal-memo.ts`**. **`EntityChip`** uses **`FileSignature`** and optional status colour.

## API

REST: **`/api/deal-memos`**, **`/api/deal-memos/[id]`**, **`POST /api/deal-memos/[id]/upload`** (multipart file), **`GET /api/deal-memos/[id]/signed-document`** (temporary signed viewer URL).

Client helpers: **`src/lib/api/deal-memos.ts`**.

## Advance per-show

Advance page integration is **UX17** — see section 2.8 of the UX13b prompt.

# UX19 — Mobile Receipt Capture

> The only mobile-creation flow in the app. Camera capture + amount/currency + category picker + auto-detected show date. Creates a canonical Expense entity, links to budget category, attaches photo. Must work offline (queue + sync when reconnected).

---

## 0. Context for Cursor

Read first:

1. `docs/cursor-prompts/UX_OVERHAUL_ROADMAP.md` — section 6.1 (mobile receipt capture).
2. UX18 — PWA shell exists; service worker registered.
3. UX02–UX18 (must be merged).

---

## 1. Why this prompt exists

The user explicitly identified receipts on the road as the single mobile-create task. All four fields (photo, amount + currency, category, show date) are required. Auto-detect show date from today's tour calendar; user can override. Offline support is critical — the user is often on a plane or in venues with bad signal.

---

## 2. Hard rules

1. **One mobile-only route**: `/m/receipt` (with `/m/` prefix to mark mobile-optimised pages — desktop redirect to a more appropriate flow if visited).
2. **Canonical Expense entity**: define schema in this prompt. Receipts ARE Expenses.
3. **Photo via `<input type="file" capture="environment">`** — opens camera on mobile. No native camera API needed.
4. **Currency defaults to current city/country** when known (use tour's current show city → look up country → default currency).
5. **Show date auto-detected** as today; user can pick from a list of nearby tour days (yesterday / today / tomorrow / pick from calendar).
6. **Category** picker tied to budget categories (Travel / Catering / Hotel / Per Diem / Other / etc).
7. **Offline queue**: if offline at submit time, store in IndexedDB. Sync when back online.
8. **Receipt photo storage**: upload to Supabase Storage. Bucket name: `receipts`. RLS ensures workspace scope.
9. **No new dependencies** beyond what's needed for IndexedDB if the user approves a tiny library (e.g. `idb`). Default: write IndexedDB by hand.
10. Lint + typecheck clean.

---

## 3. Step 1 — Schema migration

File: `database/migrations/NNN_expenses_canonical.sql`

```sql
CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  tour_id uuid NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  show_id uuid REFERENCES public.shows(id) ON DELETE SET NULL,

  -- Money
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'GBP',

  -- Categorisation
  category text NOT NULL, -- maps to budget section + sub-category
  description text,

  -- When + where
  spent_at timestamptz NOT NULL DEFAULT now(),
  city text,
  country text,

  -- Receipt
  receipt_url text, -- Supabase Storage path
  receipt_filename text,

  -- Audit
  submitted_by uuid REFERENCES auth.users(id),
  submitted_at timestamptz NOT NULL DEFAULT now(),

  -- Link to Person (for per-person reimbursement tracking)
  person_id uuid REFERENCES public.persons(id) ON DELETE SET NULL,

  -- Status (draft / submitted / approved / reimbursed)
  status text NOT NULL DEFAULT 'submitted',

  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Budget link (an Expense can be linked to a budget line)
ALTER TABLE public.budget_lines
  ADD COLUMN IF NOT EXISTS expense_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL;

CREATE INDEX expenses_workspace_id_idx ON public.expenses(workspace_id);
CREATE INDEX expenses_tour_id_idx ON public.expenses(tour_id);
CREATE INDEX expenses_show_id_idx ON public.expenses(show_id);
CREATE INDEX expenses_person_id_idx ON public.expenses(person_id);
CREATE INDEX expenses_spent_at_idx ON public.expenses(spent_at);
```

RLS standard pattern (workspace-scoped, admin-only delete). Use `set_updated_at` trigger.

Storage bucket setup (if not done elsewhere):
```sql
-- This may need to be run via Supabase dashboard or storage API
INSERT INTO storage.buckets (id, name, public) VALUES ('receipts', 'receipts', false)
ON CONFLICT DO NOTHING;
```

Storage policies: allow workspace members to read/write under `<workspace_id>/<expense_id>/<filename>` paths.

---

## 4. Step 2 — Expense entity registration

File: `src/lib/entities/expense.ts`

Register Expense as a sixth entity kind in the registry (UX08's registry was 5; bump to 6). Update the EntityKind type.

```ts
type EntityKind = 'person' | 'flight' | 'room' | 'gear' | 'show' | 'expense';
```

Descriptor:
- `getLabel`: "$X.XX · category"
- `getSecondary`: "city · spent_at"
- `SlideOverContent`: lazy-load `<ExpenseSlideOver>` for review on desktop

---

## 5. Step 3 — Mobile route + page

File: `src/app/m/receipt/page.tsx`

### 5.1 Route handling

If `window.innerWidth >= 768`, redirect to `/tours/[currentTourId]?expenseFlow=true` and open a desktop-friendly modal flow. (Or just redirect to a desktop page — whatever; this is a polish concern.)

If mobile-width: render the capture flow.

### 5.2 Layout

```
┌─────────────────────────────────┐
│ < Cancel             Submit ▶   │  ← top bar
├─────────────────────────────────┤
│                                 │
│  [Photo]                        │  ← tap to capture
│                                 │
│  Amount  [______]               │
│  Currency [GBP ▾]               │
│  Category [Travel ▾]            │
│  Show date [Today ▾]            │
│  City [auto-filled]             │
│  Description (optional)         │
│  Person (optional, default=me)  │
│                                 │
└─────────────────────────────────┘
```

- Photo capture: tap renders `<input type="file" accept="image/*" capture="environment">`. Selected file shows as a thumbnail.
- Amount: large numeric input with auto-format (`12.50` → "$12.50" preview)
- Currency: dropdown defaulting to current location's currency
- Category: dropdown with budget categories
- Show date: dropdown with [Yesterday / Today / Tomorrow / Pick…]; today is default
- City: auto-filled from tour's show on the selected date
- Description: optional free text
- Person: defaults to current user; only show if user is a TM logging others' expenses

### 5.3 Submit flow

On Submit:
1. Validate: photo + amount required
2. Generate UUID for the expense
3. If online: upload photo to Supabase Storage at `<workspace_id>/<expense_id>/<filename>`, then INSERT row into `expenses` table
4. If offline: store the form data + photo blob in IndexedDB queue (table: `expense_queue`)
5. Show success toast: "Receipt saved"
6. Reset form for another submission, or navigate back to tour view

Long-press Submit: shows option "Submit and stay on form" (default) vs "Submit and exit".

---

## 6. Step 4 — Offline queue + sync

File: `src/lib/mobile/expense-queue.ts`

IndexedDB schema:
```ts
type QueuedExpense = {
  id: string;
  payload: ExpenseInput;
  photoBlob: Blob;
  filename: string;
  enqueuedAt: number;
  attempts: number;
};
```

Functions:
- `enqueue(payload, blob, filename): Promise<void>`
- `getPending(): Promise<QueuedExpense[]>`
- `markSent(id): Promise<void>`
- `incrementAttempts(id): Promise<void>`

Sync logic (run periodically when online):
- Every 30 seconds + on `online` event
- For each pending: upload photo → INSERT row → markSent
- On failure: incrementAttempts; after 5 attempts, surface the queued item in a "Pending receipts" UI and let user retry manually

Mount the sync runner at app root (`useExpenseQueueSync()` hook).

---

## 7. Step 5 — Recent receipts list

After submit, optionally show the last 10 receipts submitted (most recent first) in a small list at the bottom of the form. Each row: thumbnail + amount + category. Tap → opens a simple read-only detail (basically the slide-over, but full screen on mobile).

If a receipt is queued (not yet uploaded), show a "syncing..." badge.

---

## 8. Step 6 — Currency / city auto-detection

`src/lib/mobile/auto-detect.ts`:

Given today's date + tour, find the show on that date (or the closest one). Return city + country + likely currency.

Currency lookup: a small static map (`{GB: 'GBP', US: 'USD', FR: 'EUR', ...}`).

If no show today, fall back to user's last-submitted city.

---

## 9. Verification

1. Lint + typecheck clean
2. On mobile (or DevTools mobile emulator): `/m/receipt` renders
3. Tap photo → camera opens
4. Submit creates an Expense row in DB; photo lands in Storage
5. Offline: submit queues; coming back online drains the queue
6. Auto-detected currency + city are correct for tour days
7. Show date dropdown defaults to today; user can override
8. PWA install on mobile shows Lowpass on home screen
9. Recent receipts list shows just-submitted item
10. Server-side: confirm RLS prevents cross-workspace reads

---

## 10. Acceptance criteria

- [ ] Migration `NNN_expenses_canonical.sql` applied
- [ ] Storage bucket + policies set up
- [ ] Expense entity registered
- [ ] `/m/receipt` page works with all 4 required fields
- [ ] Auto-detect city + currency works
- [ ] Offline queue + sync works
- [ ] Recent receipts list
- [ ] Photo upload to Supabase Storage works
- [ ] Lint + typecheck clean
- [ ] No new deps (or one small approved one for IndexedDB if user approves)

---

## 11. Out of scope

- ❌ Don't OCR receipts (defer to v2)
- ❌ Don't auto-categorise from photo (defer)
- ❌ Don't handle split receipts (defer)
- ❌ Don't surface received receipts in Budget (UX14 handles surfacing once submitted)
- ❌ Don't add reimbursement flow (defer)

---

## 12. Commit plan

Three commits:
1. `UX19: expenses schema + entity + storage`
2. `UX19: /m/receipt page + auto-detect`
3. `UX19: offline queue + sync + recent list`

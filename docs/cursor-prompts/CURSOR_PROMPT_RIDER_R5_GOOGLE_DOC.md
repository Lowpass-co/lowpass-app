# Cursor Prompt — Rider/Pack R5: Google Doc export

Seventh build PR. Prior landed:
- R1 migrations (`1210645`)
- R2 API (`f1f1e63`)
- R2b assets API (`b5369c1`)
- R3 editor + R2c contact picker (`9782952`)
- R3b asset picker (`1be30fd`)
- R4 public web link + read-only view (when shipped — **do this PR only after R4 lands**)

This PR adds one-click export of a resolved rider pack to a Google Doc. On first export, Lowpass creates a new Doc and binds its ID to the pack. On subsequent exports, Lowpass overwrites the Doc's body in place — Drive's own revision history is the audit trail.

## Scope decisions (locked, do not deviate)

- **Service account** authentication, not per-user OAuth. The service account owns every Doc. It shares the Doc with the exporting user as `writer` so they can edit or re-share manually if needed.
- **`googleapis` npm package** added as a dep. It's Google's official Node client. Manual JWT signing would add ~300 lines of brittle auth code.
- **v1 content** is plain text with styled headings:
  - Heading 1: pack title + artist name
  - Heading 2: each section title
  - Heading 3: each field label
  - Paragraph: field value
- **Skipped in v1** (land in a follow-up PR, leave clean hooks, don't fake them):
  - Images — asset fields render as `[Image: <label>]` placeholders.
  - Real Docs API tables — `FieldTable` values render as plain text grids with tab separators.
  - Rich formatting (bold/italic inside text fields, hyperlinks inline).
- **In-place updates**: on re-export, fetch the current Doc, delete its entire body content, then insert the fresh content.
- **Exports are recorded** in `rider_pack_exports` (export_type = `'google_doc'`, content_snapshot = the resolved pack JSON at export time).

---

## Files this PR creates (3 new)

1. `src/lib/google/auth.ts` — returns an authenticated `GoogleAuth` client using service-account creds from env.
2. `src/lib/google/docs-export.ts` — pure helpers that convert a `ResolvedPack` into Docs API `batchUpdate` requests. No network calls.
3. `src/app/api/rider-packs/[id]/export/google-doc/route.ts` — `POST` endpoint. Handles create-or-update, sharing, snapshot recording, pack URL persistence.

## Files this PR edits (4)

4. `src/lib/rider-packs/client.ts` — append `exportGoogleDoc` helper.
5. `src/components/rider-pack/PackEditor.tsx` — replace the `"(R5 wires this up.)"` placeholder in the `Inspector` Google Doc block with a real "Export to Google Doc" button.
6. `.env.local.example` — document the three new env vars.
7. `package.json` — add `googleapis` via `npm install`. The lockfile updates automatically.

---

## Hard rules

1. Do not create or modify files outside the 7 listed above.
2. Exactly one new npm dep: `googleapis` (only one — no peer deps added manually).
3. No changes to migrations, no changes to existing RLS policies.
4. The endpoint must NEVER log or return the service-account private key or the raw JWT. Errors from the Google API can surface their `message` only — not the full response object.
5. `FieldAsset` fields render as `[Image: <label>]` placeholders in v1. Do not attempt to embed real images — Docs API image embedding needs Drive upload + inlineObject references and is out of scope here.
6. Token refresh and retries are handled by the `googleapis` library — do not implement your own retry loop.
7. If anything is ambiguous, stop and report rather than guessing.

---

## Step 0 — Pre-flight

```bash
# A. Previous commits present.
git log --oneline | grep -E "1210645|f1f1e63|b5369c1|9782952|1be30fd" | head -5

# B. R4 has landed.
git log --oneline | grep -i "R4\|public.*web.*link\|read-only.*view" | head

# C. None of the 3 new files exist yet.
ls src/lib/google/ 2>&1
ls "src/app/api/rider-packs/[id]/export/" 2>&1

# D. All 4 edited files exist.
ls src/lib/rider-packs/client.ts
ls src/components/rider-pack/PackEditor.tsx
ls .env.local.example
ls package.json

# E. Existing placeholder in PackEditor that we'll replace.
grep -n "R5 wires this up" src/components/rider-pack/PackEditor.tsx

# F. rider_pack_exports columns — verify v1 expectations match schema.
grep -A 10 "CREATE TABLE.*rider_pack_exports" database/migrations/034_rider_pack_system.sql

# G. google_doc_id + google_doc_url already on rider_packs.
grep -n "google_doc" database/migrations/034_rider_pack_system.sql

# H. appendHistory signature (we'll best-effort append on successful export).
grep -n "export async function appendHistory" src/lib/rider-packs/history.ts

# I. resolvePack signature (server endpoint will call it).
grep -n "export async function resolvePack" src/lib/rider-packs/resolve.ts
```

Expected:
- A: 5 SHAs.
- B: at least one R4 commit.
- C: two "No such file or directory".
- D: four paths.
- E: one match, the `(R5 wires this up.)` line.
- F: columns include `export_type`, `target_id`, `target_url`, `content_snapshot`.
- G: two matches (`google_doc_id`, `google_doc_url`).
- H: one match.
- I: one match.

If B shows no R4 commit, **stop** — this PR depends on R4.

---

## Step 1 — Install `googleapis`

```bash
npm install googleapis
```

Expected: `package.json` gains `"googleapis": "^<version>"` under `dependencies`, and `package-lock.json` updates. Do not pin an exact version — let npm pick the latest caret range for the major it resolves.

### Acceptance

```bash
node -e "console.log(require('googleapis/package.json').version)"
```

Expected: a version string prints with no error.

---

## Step 2 — `src/lib/google/auth.ts`

```ts
/* ============================================
   LOWPASS — Google service-account auth

   Returns a GoogleAuth client scoped for
   Docs + Drive. Used by the rider/pack
   Google Doc export endpoint.

   Env vars required:
     GOOGLE_SERVICE_ACCOUNT_EMAIL
     GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY   (PEM; literal \n escapes are unescaped here)

   Docs kept intentionally tiny — all the
   retry / refresh logic lives inside googleapis.
   ============================================ */

import { google } from 'googleapis';

const SCOPES = [
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/drive.file',
];

let cachedAuth: ReturnType<typeof google.auth.JWT> | null = null;

export function getGoogleAuth() {
  if (cachedAuth) return cachedAuth;

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!email || !rawKey) {
    throw new Error(
      'Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY',
    );
  }

  // Vercel-style secrets often encode newlines as literal `\n` sequences.
  const privateKey = rawKey.replace(/\\n/g, '\n');

  cachedAuth = new google.auth.JWT({
    email,
    key: privateKey,
    scopes: SCOPES,
  });
  return cachedAuth;
}

export function getDocsClient() {
  return google.docs({ version: 'v1', auth: getGoogleAuth() });
}

export function getDriveClient() {
  return google.drive({ version: 'v3', auth: getGoogleAuth() });
}
```

### Acceptance

```bash
grep -n "^export function" src/lib/google/auth.ts
```

Expected: 3 lines (`getGoogleAuth`, `getDocsClient`, `getDriveClient`).

---

## Step 3 — `src/lib/google/docs-export.ts`

Pure conversion logic — takes a resolved pack, returns a `{ title, requests }` pair for the Docs API. No network calls. Unit-testable in principle.

```ts
/* ============================================
   LOWPASS — Rider/Pack → Google Doc converter

   Converts a ResolvedPack into Docs API
   batchUpdate requests. Caller is responsible
   for actually creating/updating the doc.

   v1 output:
     H1: pack title + artist
     H2: each section title
     H3: each field label
     Para: field value

   Skipped in v1 (explicit placeholders):
     - Images: rendered as "[Image: <label>]"
     - Tables: rendered as tab-separated plain text
     - Rich formatting: none

   Docs API insertText model:
     - Index 1 is always the start of the body (index 0 is the Section break).
     - Insertions happen at a specific index; indices for later ops shift.
     - Safest strategy: insert all text at once as one string, THEN apply
       style ranges computed during string assembly.
   ============================================ */

import type {
  Field,
  FieldCheckboxList,
  FieldContact,
  FieldCurrency,
  FieldNumber,
  FieldTable,
  FieldText,
  FieldTime,
  FieldUrl,
  ResolvedPack,
} from '@/lib/rider-packs/types';

type StyleKind = 'HEADING_1' | 'HEADING_2' | 'HEADING_3';

type StyleRange = {
  startIndex: number;
  endIndex: number;
  namedStyleType: StyleKind;
};

export type ExportBuild = {
  /** Doc title used for documents.create and files.update. */
  title: string;
  /** Full plain-text body (ends with \n). */
  body: string;
  /** Heading ranges to apply after inserting the body. */
  styleRanges: StyleRange[];
};

export function buildExport(
  pack: ResolvedPack['pack'] & { artist_name: string },
  sections: ResolvedPack['sections'],
): ExportBuild {
  const title =
    (pack.title?.trim() || 'Rider') + ` — ${pack.artist_name}`.trimEnd();

  // ---- Phase 1: assemble the body as a single string, tracking heading ranges.
  // Docs API uses 1-based indices. Position 1 is the first user-visible char.
  // We track `cursor` as "next insert position" starting at 1.
  const styleRanges: StyleRange[] = [];
  const parts: string[] = [];
  let cursor = 1;

  const push = (text: string, heading?: StyleKind) => {
    if (heading) {
      styleRanges.push({
        startIndex: cursor,
        endIndex: cursor + text.length,
        namedStyleType: heading,
      });
    }
    parts.push(text);
    cursor += text.length;
  };

  // Heading 1: title line (doubles as doc title inside the body).
  push(`${title}\n`, 'HEADING_1');
  push('\n');

  const ordered = [...sections].sort((a, b) => a.sort_order - b.sort_order);

  for (const section of ordered) {
    push(`${section.title}\n`, 'HEADING_2');

    const fields = (section.fields ?? []) as Field[];
    if (fields.length === 0) {
      push('(empty)\n\n');
      continue;
    }

    for (const field of fields) {
      const label = field.label?.trim() || '';
      if (label) push(`${label}\n`, 'HEADING_3');
      push(renderFieldValue(field));
      push('\n');
    }

    push('\n');
  }

  return {
    title,
    body: parts.join(''),
    styleRanges,
  };
}

/** Turn an ExportBuild into a Docs API batchUpdate request array for an
 *  EMPTY document. Call clearDocRequests() first if the doc has content. */
export function buildInsertRequests(build: ExportBuild) {
  const requests: unknown[] = [];

  // 1. Single insert of the full body at index 1.
  requests.push({
    insertText: { location: { index: 1 }, text: build.body },
  });

  // 2. Apply heading styles per computed range.
  for (const range of build.styleRanges) {
    requests.push({
      updateParagraphStyle: {
        range: { startIndex: range.startIndex, endIndex: range.endIndex },
        paragraphStyle: { namedStyleType: range.namedStyleType },
        fields: 'namedStyleType',
      },
    });
  }

  return requests;
}

/** Request array that deletes everything between index 1 and endIndex-1.
 *  endIndex is the body endIndex returned by documents.get. */
export function buildClearRequest(endIndex: number) {
  // Nothing to clear if the doc is empty (only the trailing newline at endIndex=2).
  if (endIndex <= 2) return [];
  return [
    {
      deleteContentRange: {
        range: { startIndex: 1, endIndex: endIndex - 1 },
      },
    },
  ];
}

// ---------- Field renderers (plain text) ----------

function renderFieldValue(field: Field): string {
  switch (field.type) {
    case 'text':
      return (field as FieldText).value?.trim() || '—';
    case 'time': {
      const f = field as FieldTime;
      return f.value ? `${f.value}${f.tz ? ` (${f.tz})` : ''}` : '—';
    }
    case 'currency': {
      const f = field as FieldCurrency;
      if (!Number.isFinite(f.amount)) return '—';
      try {
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: f.currency || 'USD',
        }).format(f.amount);
      } catch {
        return `${f.currency || 'USD'} ${f.amount}`;
      }
    }
    case 'number': {
      const f = field as FieldNumber;
      if (!Number.isFinite(f.value)) return '—';
      return f.unit ? `${f.value} ${f.unit}` : String(f.value);
    }
    case 'url': {
      const f = field as FieldUrl;
      const href = f.href?.trim();
      if (!href) return '—';
      return f.display_text?.trim() ? `${f.display_text} (${href})` : href;
    }
    case 'checkbox_list': {
      const f = field as FieldCheckboxList;
      if (!f.items?.length) return '—';
      return f.items
        .map((i) => `${i.checked ? '[x]' : '[ ]'} ${i.label}`)
        .join('\n');
    }
    case 'table': {
      const f = field as FieldTable;
      const cols = f.columns ?? [];
      const rows = f.rows ?? [];
      if (cols.length === 0 || rows.length === 0) return '—';
      const header = cols.map((c) => c.label).join('\t');
      const bodyRows = rows.map((r) =>
        cols.map((c) => String(r[c.key] ?? '')).join('\t'),
      );
      return [header, ...bodyRows].join('\n');
    }
    case 'contact': {
      const f = field as FieldContact;
      const entries = f.entries ?? [];
      if (entries.length === 0) return '—';
      return entries
        .map((e) => {
          const show = new Set(e.show_fields ?? []);
          const bits: string[] = [];
          if (show.has('name') && e.name) bits.push(e.name);
          if (show.has('role') && e.role) bits.push(`(${e.role})`);
          if (show.has('company') && e.company) bits.push(`— ${e.company}`);
          if (show.has('email') && e.email) bits.push(e.email);
          if (show.has('phone') && e.phone) bits.push(e.phone);
          if (show.has('notes') && e.notes) bits.push(`\n${e.notes}`);
          return bits.join(' ').trim() || '(unnamed contact)';
        })
        .join('\n');
    }
    case 'asset': {
      // v1 placeholder. Real image embedding is a follow-up PR.
      const label = field.label?.trim() || 'asset';
      return `[Image: ${label}]`;
    }
    default:
      return '—';
  }
}
```

### Acceptance

```bash
grep -n "^export function\|^export type" src/lib/google/docs-export.ts
```

Expected: 4 lines (`ExportBuild` type, `buildExport`, `buildInsertRequests`, `buildClearRequest`).

---

## Step 4 — `src/app/api/rider-packs/[id]/export/google-doc/route.ts`

The endpoint. `POST /api/rider-packs/[id]/export/google-doc` — no body required.

```ts
/* ============================================
   LOWPASS — Google Doc export endpoint

   POST /api/rider-packs/[id]/export/google-doc

   Flow:
     1. Auth + load pack + resolve sections.
     2. Look up the artist's name for the title.
     3. If pack.google_doc_id is set, update in place:
        - Fetch doc to get body endIndex.
        - batchUpdate: deleteContentRange + insertText + headings.
     4. Otherwise create a new doc:
        - documents.create(title).
        - batchUpdate: insertText + headings.
        - drive.files.update(documentId, name = title) to keep Drive label in sync.
        - drive.permissions.create to share with the exporting user as writer.
        - Save documentId + webViewLink on rider_packs.
     5. Insert a row into rider_pack_exports with the snapshot.
     6. Best-effort appendHistory(pack.id, 'pack.updated') — never throws.
     7. Return { document_id, document_url }.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { resolvePack } from '@/lib/rider-packs/resolve';
import { appendHistory } from '@/lib/rider-packs/history';
import { getDocsClient, getDriveClient } from '@/lib/google/auth';
import {
  buildClearRequest,
  buildExport,
  buildInsertRequests,
} from '@/lib/google/docs-export';
import type { RiderPack } from '@/lib/rider-packs/types';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: packId } = await params;

  // 1. Load pack (RLS scopes to workspace).
  const { data: pack } = await supabase
    .from('rider_packs')
    .select('*')
    .eq('id', packId)
    .maybeSingle<RiderPack>();
  if (!pack) {
    return NextResponse.json({ error: 'Pack not found' }, { status: 404 });
  }

  // 2. Artist name.
  const { data: artist } = await supabase
    .from('artists')
    .select('name')
    .eq('id', pack.artist_id)
    .maybeSingle();
  const artistName = artist?.name ?? 'Unknown artist';

  // 3. Resolve sections.
  const resolved = await resolvePack(supabase, pack);

  // 4. Build the doc content.
  const build = buildExport(
    { ...pack, artist_name: artistName },
    resolved.sections,
  );

  // 5. User email (for sharing).
  const exporterEmail = user.email || '';

  // 6. Do the Docs dance.
  const docs = getDocsClient();
  const drive = getDriveClient();

  let documentId: string;
  let webViewLink: string | null = pack.google_doc_url;
  const isNew = !pack.google_doc_id;

  try {
    if (pack.google_doc_id) {
      documentId = pack.google_doc_id;

      // Fetch the doc to get the current body endIndex.
      const { data: doc } = await docs.documents.get({ documentId });
      const body = doc.body?.content ?? [];
      const endIndex = body.length > 0
        ? (body[body.length - 1].endIndex ?? 2)
        : 2;

      const requests = [
        ...buildClearRequest(endIndex),
        ...buildInsertRequests(build),
      ];
      await docs.documents.batchUpdate({
        documentId,
        requestBody: { requests },
      });

      // Keep the Drive-side name in sync with the latest title.
      await drive.files.update({
        fileId: documentId,
        requestBody: { name: build.title },
      });
    } else {
      const created = await docs.documents.create({
        requestBody: { title: build.title },
      });
      documentId = created.data.documentId!;

      await docs.documents.batchUpdate({
        documentId,
        requestBody: { requests: buildInsertRequests(build) },
      });

      // Share with the user as writer (no notification email).
      if (exporterEmail) {
        try {
          await drive.permissions.create({
            fileId: documentId,
            sendNotificationEmail: false,
            requestBody: {
              role: 'writer',
              type: 'user',
              emailAddress: exporterEmail,
            },
          });
        } catch (err) {
          // Not fatal — user can still hit the URL and request access.
          console.error('Drive share failed:', err);
        }
      }

      const { data: meta } = await drive.files.get({
        fileId: documentId,
        fields: 'webViewLink',
      });
      webViewLink = meta.webViewLink ?? `https://docs.google.com/document/d/${documentId}/edit`;

      // Persist the binding on rider_packs.
      await supabase
        .from('rider_packs')
        .update({
          google_doc_id: documentId,
          google_doc_url: webViewLink,
        })
        .eq('id', pack.id);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Google API error';
    return NextResponse.json({ error: message }, { status: 502 });
  }

  // 7. Record the export.
  await supabase.from('rider_pack_exports').insert({
    pack_id: pack.id,
    exported_by: user.id,
    export_type: 'google_doc',
    target_id: documentId,
    target_url: webViewLink,
    content_snapshot: {
      pack: {
        id: pack.id,
        title: pack.title,
        scope: pack.scope,
        artist_id: pack.artist_id,
      },
      sections: resolved.sections,
      exported_at: new Date().toISOString(),
    },
  });

  // 8. Best-effort history append.
  try {
    await appendHistory(supabase, {
      packId: pack.id,
      changedBy: user.id,
      changeType: 'pack.updated',
      sectionKey: null,
      fieldKey: null,
      oldValue: null,
      newValue: {
        google_doc_id: documentId,
        google_doc_url: webViewLink,
        action: isNew ? 'exported_new' : 'exported_update',
      },
    });
  } catch (err) {
    console.error('appendHistory failed:', err);
  }

  return NextResponse.json({
    document_id: documentId,
    document_url: webViewLink,
    is_new: isNew,
  });
}
```

**Verify `appendHistory` argument shape.** Run `grep -A 10 "AppendHistoryArgs" src/lib/rider-packs/history.ts` in Step 0. If the actual argument names differ from `packId/changedBy/changeType/sectionKey/fieldKey/oldValue/newValue`, adjust the call to match — do not change the type.

### Acceptance

```bash
grep -n "^export async function POST\|buildExport\|getDocsClient\|getDriveClient" \
  "src/app/api/rider-packs/[id]/export/google-doc/route.ts"
```

Expected: 4+ lines (one for POST, one for each import used).

---

## Step 5 — Edit `src/lib/rider-packs/client.ts`

Append at the very end of the file, after the most recently added export (the R4 web-link helpers if R4 landed, otherwise after `listAssets`).

```ts
// ============================================================
// Google Doc export (R5)
// ============================================================

export async function exportGoogleDoc(packId: string): Promise<{
  document_id: string;
  document_url: string | null;
  is_new: boolean;
}> {
  const res = await fetch(`/api/rider-packs/${packId}/export/google-doc`, {
    method: 'POST',
  });
  return asJson(res);
}
```

### Acceptance

```bash
grep -n "export async function exportGoogleDoc" src/lib/rider-packs/client.ts
```

Expected: 1 line.

---

## Step 6 — Edit `src/components/rider-pack/PackEditor.tsx`

Replace the existing Google Doc block in the `Inspector` component. Find this fragment:

```tsx
      <div>
        <div className="text-[10px] uppercase tracking-wide text-neutral-400">Google Doc</div>
        {pack.google_doc_url ? (
          <a
            href={pack.google_doc_url}
            target="_blank"
            rel="noreferrer"
            className="mt-1 block text-xs text-[var(--lp-orange)] hover:underline truncate"
          >
            {pack.google_doc_url}
          </a>
        ) : (
          <div className="mt-1 text-xs text-neutral-400">Not yet exported. (R5 wires this up.)</div>
        )}
      </div>
```

Replace it with a `<ExportPanel>` invocation:

```tsx
      <ExportPanel pack={pack} onExported={onPackUpdate} />
```

Then **append** `ExportPanel` at the bottom of `PackEditor.tsx` (after `SharingPanel` if R4 landed, otherwise after `NewPackForm`):

```tsx
function ExportPanel({
  pack,
  onExported,
}: {
  pack: RiderPack;
  onExported: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleExport = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await exportGoogleDoc(pack.id);
      // Persistence happens server-side; refresh the parent so the URL renders.
      onExported();
      if (res.document_url) {
        // Open in a new tab so the user sees the doc they just exported.
        window.open(res.document_url, '_blank', 'noopener,noreferrer');
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-neutral-400">Google Doc</div>

      {pack.google_doc_url ? (
        <a
          href={pack.google_doc_url}
          target="_blank"
          rel="noreferrer"
          className="mt-1 block text-xs text-[var(--lp-orange)] hover:underline truncate"
        >
          {pack.google_doc_url}
        </a>
      ) : (
        <div className="mt-1 text-xs text-neutral-400">Not yet exported.</div>
      )}

      <div className="mt-2">
        <button
          type="button"
          onClick={handleExport}
          disabled={busy}
          className="rounded bg-[var(--lp-orange)] px-3 py-1.5 text-xs text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy
            ? 'Exporting…'
            : pack.google_doc_url
              ? 'Re-export (updates doc)'
              : 'Export to Google Doc'}
        </button>
      </div>

      {err && <div className="mt-1 text-xs text-red-600">{err}</div>}
    </div>
  );
}
```

**Imports to add at the top of the file** — extend the existing `@/lib/rider-packs/client` import. If the R4 `SharingPanel` already added imports, just add `exportGoogleDoc` alongside:

```tsx
  exportGoogleDoc,
```

### Acceptance

```bash
grep -n "function ExportPanel\|<ExportPanel\|exportGoogleDoc" \
  src/components/rider-pack/PackEditor.tsx
```

Expected: 3+ lines.

```bash
grep -c "R5 wires this up" src/components/rider-pack/PackEditor.tsx
```

Expected: `0` (placeholder removed).

---

## Step 7 — Edit `.env.local.example`

Append at the bottom (order: Spotify → Anthropic → Resend → App → Google Docs so it sits with the other integrations):

```
# Google Docs export (for rider/pack Google Doc export)
# Service account JSON → these two values + the client_email.
# Private key should be the full -----BEGIN PRIVATE KEY-----…----- block.
# In Vercel or any env that can't hold real newlines, use literal \n escapes;
# src/lib/google/auth.ts un-escapes them at runtime.
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
```

### Acceptance

```bash
grep -n "GOOGLE_SERVICE_ACCOUNT" .env.local.example
```

Expected: 2 lines.

---

## Step 8 — Verify

```bash
# Typecheck
npx tsc --noEmit

# Lint new + edited files
npx eslint \
  src/lib/google/auth.ts \
  src/lib/google/docs-export.ts \
  "src/app/api/rider-packs/[id]/export/google-doc/route.ts" \
  src/lib/rider-packs/client.ts \
  src/components/rider-pack/PackEditor.tsx

# Build
npx next build

# Git state — 3 untracked + 4 modified (package-lock.json may also appear as modified).
git status -u --short
```

If tsc or eslint flag issues, fix in place. If the build fails with `googleapis` not found, double-check `npm install` ran in Step 1. If it fails with a missing-env-var error at build time, that means something is importing `src/lib/google/auth.ts` at module-load time during build — fix by ensuring all the Google helpers are only imported inside route handlers / server-only code, not from a page or layout.

---

## Step 9 — Commit

```bash
git add \
  src/lib/google \
  "src/app/api/rider-packs/[id]/export" \
  src/lib/rider-packs/client.ts \
  src/components/rider-pack/PackEditor.tsx \
  .env.local.example \
  package.json \
  package-lock.json

git commit -m "feat(rider-pack): Google Doc export (R5)

One-click export of a resolved rider pack to a Google Doc.

- Service account auth (GOOGLE_SERVICE_ACCOUNT_EMAIL/_KEY env)
- First export: creates Doc, shares with user as writer, binds google_doc_id
- Re-export: overwrites the Doc body in place (Drive revision = audit trail)
- Records every export in rider_pack_exports with a full content snapshot
- v1 content: styled headings + plain-text field values

Deferred to follow-up: real image embedding, Docs API tables, rich formatting."

git push
```

---

## Step 10 — Report

Paste:

1. Step 0 pre-flight output (A–I).
2. Step 8: tsc summary, eslint summary, `next build` summary (last 10 lines), git status.
3. New `googleapis` version from Step 1 acceptance.
4. The 3 created file paths + the 4 edited file paths.
5. Final commit SHA.
6. Anything you stopped on. If nothing, say "nothing".

---

## For Adam (non-Cursor) — setup steps before this works in dev/prod

1. Create a Google Cloud project (or pick one).
2. Enable the **Google Docs API** and **Google Drive API** on that project.
3. Create a Service Account under IAM & Admin. Generate a JSON key, download it.
4. Extract two values from the JSON: `client_email` and `private_key`. Put them in `.env.local`:
   ```
   GOOGLE_SERVICE_ACCOUNT_EMAIL=<client_email>
   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=<private_key with \n escapes preserved>
   ```
5. First export by any workspace user will create a new Doc in the service account's Drive and share it with that user. Subsequent exports update the same Doc in place.

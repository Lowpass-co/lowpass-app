/* ============================================
   LOWPASS — /rental/print-labels (Sprint 12 §2)

   Print-friendly grid of QR labels for the Brother PTouch
   Edge. Driven by a comma-separated ?ids=… query param fed
   from the equipment grid's multi-select.

   Layout: each label is sized for 24mm continuous tape with a
   25×25mm logical label area (matching the spec's starting
   guess). The QR fills most of the label; item name + serial
   sit beneath at 7pt. CSS @page removes the browser's default
   margins so the label tape isn't padded.

   On mount, auto-firing window.print() would surprise the
   operator. Render a "Print" button at the top; Adam clicks
   when ready. The button (and the surrounding chrome) is
   hidden in the print stylesheet so the actual paper output
   is just the label grid.

   Audit log: every render of this page inserts a
   manual_correction movement per item so the rental_movements
   trail captures "labels reprinted on YYYY-MM-DD". The insert
   runs on the server during page render — no client round
   trip needed.
   ============================================ */

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { PrintTrigger } from './PrintTrigger';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ ids?: string }>;
}

interface LabelRow {
  id: string;
  qr_token: string | null;
  name: string;
  serial_number: string | null;
  workspace_id: string | null;
}

export default async function PrintLabelsPage({ searchParams }: PageProps) {
  const { ids } = await searchParams;
  const idList = (ids ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, 500); // generous cap — Adam's whole inventory comfortably fits

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let rows: LabelRow[] = [];
  let queryError: string | null = null;

  if (user && idList.length > 0) {
    const { data, error } = await supabase
      .from('rental_inventory')
      .select('id, qr_token, name, serial_number, workspace_id')
      .in('id', idList);
    if (error) {
      queryError = error.message;
    } else {
      /* Re-order by the requested id sequence so the operator's
         print order matches their grid selection order. */
      const byId = new Map<string, LabelRow>(
        (data ?? []).map((r) => [r.id as string, r as LabelRow]),
      );
      rows = idList
        .map((id) => byId.get(id))
        .filter((r): r is LabelRow => !!r);
    }
  }

  /* Audit log — one manual_correction row per item, batch
     inserted. Workspace_id is taken from the inventory rows we
     just fetched (RLS already gated them). Skipped silently on
     failure: a logging hiccup shouldn't block the operator's
     print flow. */
  if (user && rows.length > 0) {
    const workspaceId = rows[0].workspace_id;
    if (workspaceId) {
      await supabase.from('rental_movements').insert(
        rows.map((r) => ({
          workspace_id: workspaceId,
          rental_inventory_id: r.id,
          movement_type: 'manual_correction',
          scanned_by_user_id: user.id,
          notes: `QR label reprinted (${rows.length} item batch)`,
        })),
      );
    }
  }

  const missingCount = idList.length - rows.length;

  return (
    <div className="min-h-screen" style={{ background: 'var(--lp-bg)' }}>
      {/* Header: print button + back link. Hidden when printing. */}
      <header
        className="lp-print-chrome flex items-center justify-between"
        style={{
          padding: 'var(--lp-space-4)',
          borderBottom: '1px solid var(--lp-border)',
          background: 'var(--lp-panel)',
        }}
      >
        <Link
          href="/equipment"
          className="btn-transition inline-flex items-center"
          style={{
            gap: 6,
            padding: 'var(--lp-space-2) var(--lp-space-3)',
            fontSize: 'var(--lp-text-sm)',
            color: 'var(--lp-text-secondary)',
            background: 'transparent',
            border: '1px solid var(--lp-border-strong)',
            borderRadius: 'var(--lp-radius-md)',
            textDecoration: 'none',
          }}
        >
          <ChevronLeft size={14} />
          Back to inventory
        </Link>
        <div
          style={{
            fontSize: 'var(--lp-text-sm)',
            color: 'var(--lp-text-secondary)',
          }}
        >
          {rows.length} label{rows.length === 1 ? '' : 's'}
          {missingCount > 0 && (
            <span style={{ marginLeft: 8, color: 'var(--color-lp-warning, #c97a1d)' }}>
              · {missingCount} skipped
            </span>
          )}
        </div>
        <PrintTrigger disabled={rows.length === 0} />
      </header>

      {queryError && (
        <div
          role="alert"
          className="lp-print-chrome"
          style={{
            margin: 'var(--lp-space-4)',
            padding: 'var(--lp-space-3)',
            fontSize: 'var(--lp-text-sm)',
            color: 'var(--color-lp-error)',
            background: 'color-mix(in srgb, var(--color-lp-error) 8%, transparent)',
            border: '1px solid color-mix(in srgb, var(--color-lp-error) 25%, transparent)',
            borderRadius: 'var(--lp-radius-md)',
          }}
        >
          {queryError}
        </div>
      )}

      {rows.length === 0 ? (
        <div
          className="lp-print-chrome"
          style={{
            padding: 'var(--lp-space-6)',
            textAlign: 'center',
            color: 'var(--lp-text-secondary)',
            fontSize: 'var(--lp-text-sm)',
          }}
        >
          {idList.length === 0
            ? 'No items selected. Go back to /equipment and pick at least one row.'
            : 'No matching items in your workspace.'}
        </div>
      ) : (
        <main
          className="lp-print-sheet"
          style={{
            padding: 'var(--lp-space-4)',
          }}
        >
          <div className="lp-print-grid">
            {rows.map((row) => (
              <article key={row.id} className="lp-print-label">
                {row.qr_token ? (
                  /* QR is an immutable workspace-scoped SVG; no LCP benefit from next/image. */
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={`/api/rental/inventory/${row.id}/qr.svg`}
                    alt={`QR for ${row.name}`}
                    className="lp-print-qr"
                  />
                ) : (
                  <div className="lp-print-qr lp-print-qr-missing">
                    No QR
                  </div>
                )}
                <div className="lp-print-name">{row.name}</div>
                {row.serial_number && (
                  <div className="lp-print-serial">{row.serial_number}</div>
                )}
              </article>
            ))}
          </div>
        </main>
      )}

      {/* Print stylesheet. Inline so it's scoped to this route
          without polluting globals.css.

          - @page strips the browser's default margin so the
            label tape isn't padded.
          - .lp-print-chrome (header + back link + button) is
            display:none when printing.
          - .lp-print-label is sized for ~25×25mm at the
            spec's starting guess for 24mm tape. Adam can tweak
            the --lp-print-label-size CSS var below if a future
            tape width changes the calculus.
          - page-break-inside: avoid keeps a label from
            splitting across two pages. */}
      <style>{`
        :root {
          --lp-print-label-size: 25mm;
          --lp-print-label-gap: 3mm;
        }
        .lp-print-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, var(--lp-print-label-size));
          gap: var(--lp-print-label-gap);
          justify-content: start;
        }
        .lp-print-label {
          width: var(--lp-print-label-size);
          height: var(--lp-print-label-size);
          padding: 1mm;
          border: 1px dashed var(--lp-border);
          border-radius: 1mm;
          background: #ffffff;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-start;
          page-break-inside: avoid;
          break-inside: avoid;
        }
        .lp-print-qr {
          width: 18mm;
          height: 18mm;
          object-fit: contain;
          background: #ffffff;
        }
        .lp-print-qr-missing {
          display: grid;
          place-items: center;
          font-size: 6pt;
          color: var(--lp-text-tertiary);
          background: var(--lp-bg-tertiary);
        }
        .lp-print-name {
          font-size: 6pt;
          line-height: 1.1;
          margin-top: 0.5mm;
          text-align: center;
          color: #000000;
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          max-width: 100%;
        }
        .lp-print-serial {
          font-family: var(--font-mono, ui-monospace, monospace);
          font-size: 5pt;
          color: #555555;
          margin-top: 0.5mm;
          text-align: center;
        }
        @media print {
          @page {
            margin: 5mm;
          }
          .lp-print-chrome {
            display: none !important;
          }
          .lp-print-label {
            border: none;
          }
          body, html {
            background: #ffffff !important;
          }
        }
      `}</style>
    </div>
  );
}

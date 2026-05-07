/* ============================================
   LOWPASS — Sprint 8.4 §4 — <WorkspaceActivityList>

   Compact table for the workspace landing's activity feed.
   Renders the rows produced by getWorkspaceLandingData's UNION-
   merge across tours / routing / budget_line_items /
   advance_instances / deal_memos.

   Design: dot-density. Five columns:
     [PRODUCT-tag] [actor] [action] [entity] [when (mono)]

   Each row is a <Link> when href is non-null, plain row when not.
   Rows render the tour + artist context in the entity column
   already (built upstream); this component just lays them out.
   ============================================ */

import Link from 'next/link';
import type { WorkspaceLandingActivityRow } from '@/server/workspace/getWorkspaceLandingData';

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return iso;
  const min = Math.round(ms / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

/** Tag the action with its product silo so the user can scan
 *  "what changed where" at a glance. Maps the action verb to one
 *  of the four products. */
type Product = 'home' | 'operations' | 'budget' | 'advance';
function actionToProduct(action: string): Product {
  if (action.startsWith('budget')) return 'budget';
  if (action.startsWith('advance')) return 'advance';
  if (action.startsWith('show')) return 'operations';
  return 'home';
}

const PRODUCT_TONE: Record<Product, string> = {
  home: 'var(--color-lp-orange)',
  operations: 'var(--color-lp-orange)',
  budget: 'var(--color-lp-status-complete)',
  advance: 'var(--color-lp-status-in-progress)',
};
const PRODUCT_LABEL: Record<Product, string> = {
  home: 'TOUR',
  operations: 'OPS',
  budget: 'BUDGET',
  advance: 'ADVANCE',
};

export function WorkspaceActivityList({
  rows,
}: {
  rows: WorkspaceLandingActivityRow[];
}) {
  return (
    <div
      className="overflow-hidden"
      style={{
        background: 'var(--lp-bg-deep)',
        border: '1px solid var(--lp-border-strong)',
        borderRadius: 'var(--lp-radius-lg)',
      }}
    >
      <table className="lp-dense w-full">
        <thead>
          <tr
            style={{
              background: 'var(--lp-panel)',
              borderBottom: '1px solid var(--lp-border-subtle)',
            }}
          >
            <Th>Product</Th>
            <Th>Actor</Th>
            <Th>Action</Th>
            <Th>Entity</Th>
            <Th align="right">When</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const product = actionToProduct(row.action);
            const entityNode = row.href ? (
              <Link
                href={row.href}
                className="truncate"
                style={{
                  color: 'var(--lp-text)',
                  textDecoration: 'none',
                }}
                title={row.entity}
              >
                {row.entity}
              </Link>
            ) : (
              <span
                className="truncate"
                style={{ color: 'var(--lp-text)' }}
                title={row.entity}
              >
                {row.entity}
              </span>
            );
            return (
              <tr
                key={row.id}
                style={{
                  borderTop: '1px solid var(--lp-border-subtle)',
                }}
              >
                <Td>
                  <ProductBadge product={product} />
                </Td>
                <Td>
                  <span style={{ color: 'var(--lp-text)' }}>
                    {row.actor || '—'}
                  </span>
                </Td>
                <Td>
                  <span
                    className="truncate"
                    style={{ color: 'var(--lp-text-secondary)' }}
                  >
                    {row.action}
                  </span>
                </Td>
                <Td>{entityNode}</Td>
                <Td align="right">
                  <span
                    className="lp-mono"
                    style={{ color: 'var(--lp-text-secondary)' }}
                  >
                    {formatRelative(row.occurredAt)}
                  </span>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ProductBadge({ product }: { product: Product }) {
  const tone = PRODUCT_TONE[product];
  return (
    <span
      className="inline-flex items-center"
      style={{
        padding: '2px 8px',
        borderRadius: 'var(--lp-radius-full)',
        fontSize: '10px',
        fontWeight: 600,
        letterSpacing: '0.05em',
        color: tone,
        background: `color-mix(in srgb, ${tone} 12%, transparent)`,
      }}
    >
      {PRODUCT_LABEL[product]}
    </span>
  );
}

function Th({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <th
      className="px-3 py-2"
      style={{
        textAlign: align ?? 'left',
        fontSize: '10px',
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--lp-text-tertiary)',
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <td
      className="px-3 py-2"
      style={{
        textAlign: align ?? 'left',
        verticalAlign: 'middle',
        fontSize: 'var(--lp-text-xs)',
      }}
    >
      {children}
    </td>
  );
}

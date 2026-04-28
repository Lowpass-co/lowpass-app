import type { DealMemo, DealMemoListRow, DealMemoStatus } from '@/lib/types/deal-memo';

type Snake = Record<string, unknown>;

/** Map Postgres row shape to DealMemo (shared server + client). */
export function mapDealMemo(row: Snake): DealMemo {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    tourId: String(row.tour_id),
    showId: row.show_id ? String(row.show_id) : null,
    title: String(row.title ?? ''),
    reference: (row.reference as string | null) ?? null,
    promoterName: (row.promoter_name as string | null) ?? null,
    promoterEmail: (row.promoter_email as string | null) ?? null,
    promoterPhone: (row.promoter_phone as string | null) ?? null,
    feeAmount: row.fee_amount != null ? Number(row.fee_amount) : null,
    feeCurrency: (row.fee_currency as string) ?? 'GBP',
    depositAmount: row.deposit_amount != null ? Number(row.deposit_amount) : null,
    depositCurrency: (row.deposit_currency as string | null) ?? null,
    settlementMethod: (row.settlement_method as string | null) ?? null,
    status: (row.status as DealMemoStatus) ?? 'draft',
    sentAt: (row.sent_at as string | null) ?? null,
    signedAt: (row.signed_at as string | null) ?? null,
    expiresAt: (row.expires_at as string | null) ?? null,
    documentUrl: (row.document_url as string | null) ?? null,
    documentFilename: (row.document_filename as string | null) ?? null,
    termsSummary: (row.terms_summary as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function mapListRow(row: Snake): DealMemoListRow {
  const base = mapDealMemo(row);
  const extras = row as Snake & {
    tour_name?: string | null;
    show_label?: string | null;
  };
  return {
    ...base,
    tourName: extras.tour_name ?? null,
    showLabel: extras.show_label ?? null,
  };
}

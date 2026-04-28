/** Deal memo — canonical workspace/tour/show scoped contracts. */

export type DealMemoStatus = 'draft' | 'sent' | 'pending' | 'signed' | 'expired';

export type DealMemo = {
  id: string;
  workspaceId: string;
  tourId: string;
  /** NULL = tour-wide memo; UUID of routing row = show-specific */
  showId: string | null;
  title: string;
  reference: string | null;
  promoterName: string | null;
  promoterEmail: string | null;
  promoterPhone: string | null;
  feeAmount: number | null;
  feeCurrency: string;
  depositAmount: number | null;
  depositCurrency: string | null;
  settlementMethod: string | null;
  status: DealMemoStatus;
  sentAt: string | null;
  signedAt: string | null;
  expiresAt: string | null;
  documentUrl: string | null;
  documentFilename: string | null;
  termsSummary: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

/** API create/patch snake_case body (subset). */
export type DealMemoInput = Partial<{
  tour_id: string;
  show_id: string | null;
  title: string;
  reference: string | null;
  promoter_name: string | null;
  promoter_email: string | null;
  promoter_phone: string | null;
  fee_amount: number | null;
  fee_currency: string | null;
  deposit_amount: number | null;
  deposit_currency: string | null;
  settlement_method: string | null;
  status: DealMemoStatus;
  sent_at: string | null;
  signed_at: string | null;
  expires_at: string | null;
  document_url: string | null;
  document_filename: string | null;
  terms_summary: string | null;
  notes: string | null;
}>;

/** Row including joined labels for lists (optional). */
export type DealMemoListRow = DealMemo & {
  tourName?: string | null;
  showLabel?: string | null;
};

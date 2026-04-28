'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Download, Loader2, Trash2 } from 'lucide-react';
import { getDealMemoById, updateDealMemo, deleteDealMemo, getSignedDealMemoDocumentUrl } from '@/lib/api/deal-memos';
import type { DealMemoInput, DealMemoListRow, DealMemoStatus } from '@/lib/types/deal-memo';
import { SlideOver } from '@/components/shell/SlideOver';
import { cn } from '@/lib/utils';

const IC =
  'w-full rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text outline-none focus:border-lp-orange';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 border-b border-lp-border/70 pb-4">
      <h3 className="text-[10px] font-bold uppercase tracking-wider text-lp-text-tertiary">{title}</h3>
      {children}
    </section>
  );
}

function statusBadgeStyle(status: DealMemoStatus): { bg: string; fg: string } {
  switch (status) {
    case 'signed':
      return {
        bg: 'color-mix(in srgb, var(--lp-success) 18%, transparent)',
        fg: 'var(--lp-success)',
      };
    case 'pending':
      return {
        bg: 'color-mix(in srgb, var(--lp-warning, #f59e0b) 18%, transparent)',
        fg: 'var(--lp-warning, #f59e0b)',
      };
    case 'sent':
      return {
        bg: 'color-mix(in srgb, var(--lp-orange) 14%, transparent)',
        fg: 'var(--lp-orange)',
      };
    case 'expired':
      return { bg: 'var(--lp-bg-tertiary)', fg: 'var(--lp-text-secondary)' };
    default:
      return { bg: 'var(--lp-bg-tertiary)', fg: 'var(--lp-text-tertiary)' };
  }
}

function toLocalDatetime(value: string | null): string {
  if (!value) return '';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return '';
  }
}

function localDatetimeToIso(v: string): string | null {
  if (!v.trim()) return null;
  const ms = Date.parse(v);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

type RoutingOption = { id: string; label: string };

export default function DealMemoSlideOver({ id, onClose }: { id: string; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [memo, setMemo] = useState<DealMemoListRow | null>(null);
  const [isWorkspaceAdmin, setIsWorkspaceAdmin] = useState(false);

  const [title, setTitle] = useState('');
  const [reference, setReference] = useState('');
  const [promoterName, setPromoterName] = useState('');
  const [promoterEmail, setPromoterEmail] = useState('');
  const [promoterPhone, setPromoterPhone] = useState('');
  const [feeAmount, setFeeAmount] = useState('');
  const [feeCurrency, setFeeCurrency] = useState('GBP');
  const [depositAmount, setDepositAmount] = useState('');
  const [depositCurrency, setDepositCurrency] = useState('');
  const [settlementMethod, setSettlementMethod] = useState('');
  const [status, setStatus] = useState<DealMemoStatus>('draft');
  const [sentAt, setSentAt] = useState('');
  const [signedAt, setSignedAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [termsSummary, setTermsSummary] = useState('');
  const [notes, setNotes] = useState('');
  const [showId, setShowId] = useState<string>('');

  const [routingOpts, setRoutingOpts] = useState<RoutingOption[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    fetch('/api/workspace/me', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.isWorkspaceAdmin) setIsWorkspaceAdmin(true);
      })
      .catch(() => {});
  }, []);

  const loadRouting = useCallback(async (tourId: string) => {
    const res = await fetch(`/api/tours/${encodeURIComponent(tourId)}/routing?lite=1`, { credentials: 'include' });
    if (!res.ok) return;
    const j = (await res.json()) as { routing?: { id: string; date: string; venue_name?: string | null }[] };
    const rows = j.routing ?? [];
    setRoutingOpts(
      rows.map((r) => ({
        id: r.id,
        label: `${r.date}${r.venue_name ? ` · ${r.venue_name}` : ''}`,
      })),
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getDealMemoById(id)
      .then((m) => {
        if (cancelled) return;
        if (!m) throw new Error('Deal memo not found');
        setMemo(m);
        setTitle(m.title);
        setReference(m.reference ?? '');
        setPromoterName(m.promoterName ?? '');
        setPromoterEmail(m.promoterEmail ?? '');
        setPromoterPhone(m.promoterPhone ?? '');
        setFeeAmount(m.feeAmount != null ? String(m.feeAmount) : '');
        setFeeCurrency(m.feeCurrency || 'GBP');
        setDepositAmount(m.depositAmount != null ? String(m.depositAmount) : '');
        setDepositCurrency(m.depositCurrency ?? '');
        setSettlementMethod(m.settlementMethod ?? '');
        setStatus(m.status);
        setSentAt(toLocalDatetime(m.sentAt));
        setSignedAt(toLocalDatetime(m.signedAt));
        setExpiresAt(toLocalDatetime(m.expiresAt));
        setTermsSummary(m.termsSummary ?? '');
        setNotes(m.notes ?? '');
        setShowId(m.showId ?? '');
        return loadRouting(m.tourId);
      })
      .catch((e) => !cancelled && setError((e as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id, loadRouting]);

  useEffect(() => {
    let cancelled = false;
    if (!memo?.documentUrl) {
      setPreviewUrl(null);
      setPreviewLoading(false);
      return;
    }
    setPreviewLoading(true);
    void getSignedDealMemoDocumentUrl(id)
      .then((u) => {
        if (!cancelled) setPreviewUrl(u);
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [memo?.documentUrl, memo?.updatedAt, id]);

  const headerStart = useMemo(() => {
    const s = statusBadgeStyle(status);
    return (
      <span
        className="inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
        style={{ backgroundColor: s.bg, color: s.fg }}
      >
        {status}
      </span>
    );
  }, [status]);

  const subtitle = memo ? (
    <span className="text-xs" style={{ color: 'var(--lp-text-secondary)' }}>
      {memo.tourName ?? 'Tour'}{' '}
      {memo.reference ? <>· Ref {memo.reference}</> : null}
    </span>
  ) : null;

  async function patchMemo(patch: DealMemoInput) {
    const updated = await updateDealMemo(id, patch);
    setMemo(updated);
  }

  const persist = async (patch: DealMemoInput) => {
    setSaving(true);
    setError(null);
    try {
      await patchMemo(patch);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const saveAll = () => {
    void persist({
      title: title.trim(),
      reference: reference.trim() || null,
      promoter_name: promoterName.trim() || null,
      promoter_email: promoterEmail.trim() || null,
      promoter_phone: promoterPhone.trim() || null,
      fee_amount: feeAmount === '' ? null : Number(feeAmount),
      fee_currency: feeCurrency || 'GBP',
      deposit_amount: depositAmount === '' ? null : Number(depositAmount),
      deposit_currency: depositCurrency.trim() || null,
      settlement_method: settlementMethod.trim() || null,
      status,
      sent_at: localDatetimeToIso(sentAt),
      signed_at: localDatetimeToIso(signedAt),
      expires_at: localDatetimeToIso(expiresAt),
      terms_summary: termsSummary.trim() || null,
      notes: notes.trim() || null,
      show_id: showId.trim() === '' ? null : showId.trim(),
    });
  };

  const uploadFile = async (file: File) => {
    setSaving(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set('file', file);
      const res = await fetch(`/api/deal-memos/${encodeURIComponent(id)}/upload`, {
        method: 'POST',
        body: fd,
        credentials: 'include',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string }).error ?? 'Upload failed');
      await getDealMemoById(id).then((next) => {
        if (next) setMemo(next);
      });
      void getSignedDealMemoDocumentUrl(id).then(setPreviewUrl);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const downloadDocument = async () => {
    const u = previewUrl ?? (await getSignedDealMemoDocumentUrl(id));
    if (!u) {
      setError('No downloadable document.');
      return;
    }
    window.open(u, '_blank', 'noopener,noreferrer');
  };

  const removeAdmin = async () => {
    if (!isWorkspaceAdmin) return;
    if (!window.confirm('Delete this deal memo permanently?')) return;
    setSaving(true);
    setError(null);
    try {
      await deleteDealMemo(id);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const isPdf =
    memo?.documentFilename?.toLowerCase().endsWith('.pdf') ||
    (memo?.documentUrl?.toLowerCase().includes('.pdf') ?? false);

  return (
    <SlideOver
      open
      onClose={onClose}
      title={title || 'Deal memo'}
      headerStart={headerStart}
      subtitle={subtitle}
      headerActions={
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md border border-lp-border px-2.5 py-1 text-xs font-medium text-lp-text',
            !memo?.documentUrl && 'pointer-events-none opacity-40'
          )}
          disabled={!memo?.documentUrl || saving}
          onClick={() => void downloadDocument()}
        >
          <Download className="h-3.5 w-3.5" aria-hidden />
          Download
        </button>
      }
      width="wide"
      backdrop
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {isWorkspaceAdmin ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-red-400/70 px-3 py-2 text-sm text-red-600 disabled:opacity-50"
              disabled={saving}
              onClick={() => void removeAdmin()}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              Delete
            </button>
          ) : null}
          <button
            type="button"
            className="rounded-md border border-lp-border px-3 py-2 text-sm text-lp-text"
            onClick={onClose}
          >
            Close
          </button>
          <button
            type="button"
            disabled={saving || loading}
            onClick={() => void saveAll()}
            className="rounded-md bg-lp-orange px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-lp-text-secondary">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        )}
        {error && <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        {!loading && memo && (
          <>
            <Section title="Document">
              {memo.documentUrl ? (
                isPdf ? (
                  previewLoading ? (
                    <div className="flex min-h-[200px] items-center justify-center gap-2 rounded-lg border border-lp-border bg-lp-bg-secondary text-sm text-lp-text-secondary">
                      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                      Preparing preview…
                    </div>
                  ) : (
                    <embed
                      type="application/pdf"
                      src={previewUrl ?? undefined}
                      title="Deal memo document"
                      className="min-h-[360px] w-full rounded-lg border border-lp-border bg-lp-bg-secondary"
                    />
                  )
                ) : (
                  <p className="text-sm text-lp-text-secondary">
                    {memo.documentFilename ?? 'Document'}{' '}
                    <button
                      type="button"
                      className="ml-2 text-sm font-medium text-lp-orange underline"
                      onClick={() => void downloadDocument()}
                    >
                      Open preview
                    </button>
                  </p>
                )
              ) : (
                <p className="text-xs text-lp-text-tertiary">No document uploaded yet.</p>
              )}
              <label className="mt-2 flex cursor-pointer flex-col gap-1 text-xs">
                <span className="font-medium text-lp-text-secondary">Upload PDF or image</span>
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/*"
                  className="text-sm text-lp-text file:rounded file:border file:border-lp-border file:bg-lp-bg-secondary file:px-2 file:py-1"
                  disabled={saving}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) void uploadFile(f);
                  }}
                />
              </label>
            </Section>

            <Section title="Identity">
              <input className={IC} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
              <div className="grid gap-3 sm:grid-cols-2">
                <input className={IC} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Reference" />
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-lp-text-tertiary">Status</span>
                  <span
                    className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                    style={{
                      ...statusBadgeStyle(status),
                      color: statusBadgeStyle(status).fg,
                    }}
                  >
                    {status}
                  </span>
                </div>
              </div>
            </Section>

            <Section title="Scope">
              <div
                className="rounded-lg border border-lp-border/80 px-3 py-2 text-sm"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--lp-bg-secondary) 94%, transparent)',
                }}
              >
                <span className="text-lp-text-tertiary">Tour · </span>
                <span className="font-medium text-lp-text">{memo.tourName ?? memo.tourId}</span>
              </div>
              <label className="block pt-2 text-[10px] font-bold uppercase text-lp-text-tertiary">Show linkage</label>
              <select
                className={IC}
                value={showId}
                onChange={(e) => {
                  const next = e.target.value;
                  setShowId(next);
                  void patchMemo({ show_id: next === '' ? null : next }).catch((e) => setError((e as Error).message));
                }}
                aria-label="Link to show routing row"
              >
                <option value="">Tour-wide (no specific show)</option>
                {routingOpts.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
              {memo.showId ? (
                <p className="text-xs text-lp-text-tertiary">Current: {memo.showLabel ?? 'Show-linked memo'}</p>
              ) : (
                <p className="text-xs text-lp-text-tertiary">This memo applies to the entire tour unless a show is linked.</p>
              )}
            </Section>

            <Section title="Counterparty">
              <div className="grid gap-3 sm:grid-cols-2">
                <input className={IC} value={promoterName} onChange={(e) => setPromoterName(e.target.value)} placeholder="Promoter name" />
                <input className={IC} value={promoterEmail} onChange={(e) => setPromoterEmail(e.target.value)} placeholder="Promoter email" />
                <input className={IC} value={promoterPhone} onChange={(e) => setPromoterPhone(e.target.value)} placeholder="Promoter phone" />
              </div>
            </Section>

            <Section title="Money">
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  className={IC}
                  type="number"
                  step="0.01"
                  value={feeAmount}
                  onChange={(e) => setFeeAmount(e.target.value)}
                  placeholder="Fee amount"
                />
                <input
                  className={IC}
                  value={feeCurrency}
                  onChange={(e) => setFeeCurrency(e.target.value.toUpperCase())}
                  maxLength={8}
                  placeholder="Fee currency"
                />
                <input
                  className={IC}
                  type="number"
                  step="0.01"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  placeholder="Deposit amount"
                />
                <input
                  className={IC}
                  value={depositCurrency}
                  onChange={(e) => setDepositCurrency(e.target.value.toUpperCase())}
                  placeholder="Deposit currency"
                />
                <select
                  className={cn(IC, 'sm:col-span-2')}
                  value={settlementMethod}
                  onChange={(e) => setSettlementMethod(e.target.value)}
                  aria-label="Settlement method"
                >
                  <option value="">Settlement method…</option>
                  <option value="bank-transfer">Bank transfer</option>
                  <option value="cheque">Cheque</option>
                  <option value="cash">Cash</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </Section>

            <Section title="Lifecycle">
              <div className="grid gap-3 sm:grid-cols-2">
                <select
                  className={IC}
                  value={status}
                  onChange={(e) => setStatus(e.target.value as DealMemoStatus)}
                  aria-label="Workflow status"
                >
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                  <option value="pending">Pending signature</option>
                  <option value="signed">Signed</option>
                  <option value="expired">Expired</option>
                </select>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="text-xs">
                  <span className="block text-lp-text-tertiary">Sent</span>
                  <input
                    className={IC}
                    type="datetime-local"
                    value={sentAt}
                    onChange={(e) => setSentAt(e.target.value)}
                  />
                </label>
                <label className="text-xs">
                  <span className="block text-lp-text-tertiary">Signed</span>
                  <input
                    className={IC}
                    type="datetime-local"
                    value={signedAt}
                    onChange={(e) => setSignedAt(e.target.value)}
                  />
                </label>
                <label className="text-xs">
                  <span className="block text-lp-text-tertiary">Expires</span>
                  <input
                    className={IC}
                    type="datetime-local"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                  />
                </label>
              </div>
            </Section>

            <Section title="Terms summary">
              <textarea
                className={cn(IC, 'min-h-28')}
                value={termsSummary}
                onChange={(e) => setTermsSummary(e.target.value)}
                placeholder="Executive summary of terms…"
              />
            </Section>

            <Section title="Notes">
              <textarea className={cn(IC, 'min-h-28')} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" />
            </Section>

            <Section title="Activity">
              <p className="text-xs text-lp-text-tertiary">
                Workspace activity for this memo will surface here when audit logging lands.
              </p>
              <p className="mt-2 text-[10px] text-lp-text-tertiary">
                Updated {new Date(memo.updatedAt).toLocaleString()}
                {memo.createdAt ? <> · Created {new Date(memo.createdAt).toLocaleString()}</> : null}
              </p>
            </Section>
          </>
        )}
      </div>
    </SlideOver>
  );
}

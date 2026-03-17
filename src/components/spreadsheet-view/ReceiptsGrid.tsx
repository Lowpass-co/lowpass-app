'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { GridTable } from './GridTable';
import { InlineEditCell } from './InlineEditCell';
import { cn } from '@/lib/utils';
import type { ExpenseReceipt } from '@/types';

function ocrCategoryToReceiptCategory(ocr: string | null): string {
  if (!ocr) return 'prod_misc';
  const map: Record<string, string> = {
    hotel: 'hotels',
    transport: 'transport_misc',
    production: 'prod_misc',
    catering: 'prod_misc',
    misc: 'prod_misc',
  };
  return map[ocr.toLowerCase()] ?? 'prod_misc';
}

function ocrPaymentToReceipt(ocr: string | null): string {
  if (!ocr) return 'card';
  const map: Record<string, string> = {
    card: 'card',
    cash: 'cash',
    bank_transfer: 'bank_transfer',
  };
  return map[ocr.toLowerCase()] ?? 'card';
}

const PAYMENT_OPTIONS: { value: string; label: string }[] = [
  { value: 'card', label: 'Card' },
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'company_card', label: 'Company card' },
];

const CATEGORY_OPTIONS = [
  'hotels', 'flights', 'transport_bus', 'transport_taxis', 'transport_fuel',
  'transport_parking', 'transport_misc', 'transport_agent',
  'prod_audio', 'prod_lighting', 'prod_freight', 'prod_equipment',
  'prod_programming', 'prod_set_wardrobe', 'prod_misc',
].map((c) => ({ value: c, label: c.replace(/_/g, ' ') }));

const IN_BUDGET_OPTIONS = [
  { value: 'true', label: 'Yes' },
  { value: 'false', label: 'No' },
];

const COLS = [
  { key: 'receipt_number', label: '#', width: '70px' },
  { key: 'date', label: 'Date', width: '100px' },
  { key: 'vendor', label: 'Vendor', width: '120px' },
  { key: 'category', label: 'Category', width: '120px' },
  { key: 'description', label: 'Description', width: '140px' },
  { key: 'payment_method', label: 'Payment Method', width: '110px' },
  { key: 'cost_tour', label: 'Cost (Tour)', width: '100px', align: 'right' as const },
  { key: 'cost_home', label: 'Cost (Home)', width: '100px', align: 'right' as const },
  { key: 'in_budget', label: 'In Budget', width: '80px' },
  { key: 'linked_line_item_id', label: 'Linked Item', width: '100px' },
];

export function ReceiptsGrid({ tourId, currency }: { tourId: string; currency: string }) {
  const [receipts, setReceipts] = useState<ExpenseReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [ocrPrefilledIds, setOcrPrefilledIds] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/budget/receipts?tour_id=${tourId}`);
      if (!res.ok) throw new Error('Failed to load receipts');
      const json = await res.json();
      setReceipts(json.receipts ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error loading data');
    } finally {
      setLoading(false);
    }
  }, [tourId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const saveReceipt = useCallback(async (id: string, field: string, value: string | number) => {
    const body: Record<string, unknown> = { id };
    if (field === 'in_budget') body.in_budget = value === 'true';
    else if (field === 'cost_tour') body.cost_tour_currency = value;
    else if (field === 'cost_home') body.cost_home_currency = value;
    else body[field] = value === '' ? null : value;
    const res = await fetch('/api/budget/receipts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('Save failed');
    const updated = await res.json();
    setReceipts((prev) => prev.map((r) => (r.id === id ? updated : r)));
    setOcrPrefilledIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const addReceipt = useCallback(async () => {
    const res = await fetch('/api/budget/receipts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tour_id: tourId,
        vendor: '',
        cost_tour_currency: 0,
        cost_home_currency: 0,
      }),
    });
    if (!res.ok) throw new Error('Create failed');
    const created = await res.json();
    setReceipts((prev) => [created, ...prev]);
  }, [tourId]);

  const scanReceipt = useCallback(async () => {
    fileInputRef.current?.click();
  }, []);

  const handleOcrFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !tourId) return;
      e.target.value = '';
      setScanning(true);
      setError(null);
      try {
        const formData = new FormData();
        formData.set('file', file);
        formData.set('currency', currency);
        const ocrRes = await fetch('/api/budget/receipts/ocr', {
          method: 'POST',
          body: formData,
        });
        if (!ocrRes.ok) {
          const err = await ocrRes.json().catch(() => ({}));
          throw new Error(err.error || 'Scan failed');
        }
        const ocr = await ocrRes.json();
        const amount = Number(ocr.total_amount) || 0;
        const createRes = await fetch('/api/budget/receipts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tour_id: tourId,
            date: ocr.date ?? null,
            vendor: ocr.vendor ?? '',
            category: ocrCategoryToReceiptCategory(ocr.category),
            description: ocr.description ?? '',
            payment_method: ocrPaymentToReceipt(ocr.payment_method),
            cost_tour_currency: amount,
            cost_home_currency: amount,
          }),
        });
        if (!createRes.ok) throw new Error('Create receipt failed');
        const created = await createRes.json();
        setReceipts((prev) => [created, ...prev]);
        setOcrPrefilledIds((prev) => new Set(prev).add(created.id));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Scan failed');
      } finally {
        setScanning(false);
      }
    },
    [tourId, currency]
  );

  if (loading) return <div className="text-sm text-lp-text-secondary py-4">Loading…</div>;
  if (error) return <div className="text-sm text-lp-error py-4">{error}</div>;

  const formatter = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  });

  return (
    <div className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-hidden
        onChange={handleOcrFile}
      />
      <GridTable columns={COLS}>
        {receipts.map((r) => (
          <tr
            key={r.id}
            className={cn(
              'even:bg-lp-surface/30',
              ocrPrefilledIds.has(r.id) && 'bg-orange-500/10'
            )}
          >
            <td className="px-2 py-1 text-sm text-lp-text-secondary">{r.receipt_number}</td>
            <td className="px-2 py-0">
              <InlineEditCell
                value={r.date ? r.date.slice(0, 10) : null}
                type="text"
                onSave={async (v) => saveReceipt(r.id, 'date', String(v))}
              />
            </td>
            <td className="px-2 py-0">
              <InlineEditCell
                value={r.vendor}
                type="text"
                onSave={async (v) => saveReceipt(r.id, 'vendor', String(v))}
              />
            </td>
            <td className="px-2 py-0">
              <InlineEditCell
                value={r.category}
                type="select"
                options={CATEGORY_OPTIONS}
                onSave={async (v) => saveReceipt(r.id, 'category', String(v))}
              />
            </td>
            <td className="px-2 py-0">
              <InlineEditCell
                value={r.description}
                type="text"
                onSave={async (v) => saveReceipt(r.id, 'description', String(v))}
              />
            </td>
            <td className="px-2 py-0">
              <InlineEditCell
                value={r.payment_method}
                type="select"
                options={PAYMENT_OPTIONS}
                onSave={async (v) => saveReceipt(r.id, 'payment_method', String(v))}
              />
            </td>
            <td className="px-2 py-0">
              <InlineEditCell
                value={r.cost_tour_currency}
                type="currency"
                currency={currency}
                onSave={async (v) => saveReceipt(r.id, 'cost_tour', v)}
                align="right"
              />
            </td>
            <td className="px-2 py-0">
              <InlineEditCell
                value={r.cost_home_currency}
                type="currency"
                currency={currency}
                onSave={async (v) => saveReceipt(r.id, 'cost_home', v)}
                align="right"
              />
            </td>
            <td className="px-2 py-0">
              <InlineEditCell
                value={r.in_budget ? 'true' : 'false'}
                type="select"
                options={IN_BUDGET_OPTIONS}
                onSave={async (v) => saveReceipt(r.id, 'in_budget', v)}
              />
            </td>
            <td className="px-2 py-1 text-sm text-lp-text-secondary">
              {r.linked_line_item_id ?? '—'}
            </td>
          </tr>
        ))}
      </GridTable>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={addReceipt}
          className="text-lp-orange text-sm font-semibold hover:underline"
        >
          + Add Receipt
        </button>
        <button
          type="button"
          onClick={scanReceipt}
          disabled={scanning}
          className="text-lp-orange text-sm font-semibold hover:underline disabled:opacity-50"
        >
          {scanning ? 'Scanning receipt…' : 'Scan Receipt'}
        </button>
      </div>
    </div>
  );
}

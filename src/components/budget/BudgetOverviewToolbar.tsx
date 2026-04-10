'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { BUDGET_CURRENCY_OPTIONS } from '@/lib/budget-currency';
import { StyledSelect, type StyledSelectOption } from '@/components/ui/StyledSelect';

const OPTIONS: StyledSelectOption<string>[] = BUDGET_CURRENCY_OPTIONS.map((o) => ({
  value: o.code,
  label: o.label,
}));

export function BudgetOverviewToolbar({ tourId }: { tourId: string }) {
  const [currency, setCurrency] = useState('GBP');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tours/${tourId}`);
      if (!res.ok) return;
      const t = await res.json();
      const c = typeof t.currency === 'string' && t.currency.trim() ? t.currency.trim().toUpperCase() : 'GBP';
      setCurrency(c);
    } finally {
      setLoading(false);
    }
  }, [tourId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onCurrencyChange = async (code: string) => {
    const next = code.toUpperCase();
    setCurrency(next);
    setSaving(true);
    try {
      await fetch(`/api/tours/${tourId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currency: next }),
      });
    } catch {
      void load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
      <label className="text-[10px] font-bold uppercase tracking-wider text-lp-table-header-text whitespace-nowrap">
        Tour currency
      </label>
      <div className="flex items-center gap-2">
        <StyledSelect
          value={currency}
          onChange={(v) => void onCurrencyChange(v || 'GBP')}
          options={OPTIONS}
          placeholder="Currency"
          className="min-w-[11rem]"
          disabled={loading}
        />
        {saving || loading ? <Loader2 className="h-4 w-4 animate-spin text-lp-text-tertiary" aria-hidden /> : null}
      </div>
    </div>
  );
}

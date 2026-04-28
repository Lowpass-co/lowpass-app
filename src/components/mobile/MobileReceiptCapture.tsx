'use client';

import type { ExpenseInput } from '@/lib/api/expenses';
import type { Expense } from '@/lib/types/expense';
import { autoDetectForDate, addDaysIso, localTodayIso } from '@/lib/mobile/auto-detect';
import { enqueueExpense } from '@/lib/mobile/expense-queue';
import { getPendingExpenses } from '@/lib/mobile/expense-queue';
import { useArtistTourContext } from '@/contexts/ArtistTourContext';
import { useToast } from '@/components/ui/Toast';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

export const RECEIPT_CATEGORIES = [
  'Travel',
  'Catering',
  'Hotel',
  'Per Diem',
  'Flights',
  'Production',
  'Other',
] as const;

const CURRENCIES = ['GBP', 'USD', 'EUR', 'CAD', 'AUD', 'JPY', 'CHF', 'SEK'];

const LAST_EXP_SUBMIT_KEY = 'lp:last-exp-submit';

function spentAtISOFromLocalDate(dateIso: string): string {
  const [y, m, d] = dateIso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0).toISOString();
}

function parseAmount(s: string): number | null {
  const t = s.replace(/[^0-9.,-]/g, '').replace(',', '.');
  const n = parseFloat(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatPreview(amountStr: string, currency: string): string {
  const n = parseAmount(amountStr);
  if (n == null) return '';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency || 'GBP',
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

function formatAmountNum(amount: unknown, currency: string): string {
  const n = typeof amount === 'number' ? amount : Number(amount);
  if (!Number.isFinite(n)) return '';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency || 'GBP',
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

function ReceiptThumb({
  pendingBlob,
  signedUrl,
}: {
  pendingBlob?: Blob | null;
  signedUrl?: string | null;
}) {
  const [blobUrl, setBlobUrl] = useState('');
  useEffect(() => {
    if (!pendingBlob) {
      queueMicrotask(() => setBlobUrl(''));
      return;
    }
    const u = URL.createObjectURL(pendingBlob);
    queueMicrotask(() => setBlobUrl(u));
    return () => URL.revokeObjectURL(u);
  }, [pendingBlob]);

  if (blobUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- temporary blob preview
      <img src={blobUrl} alt="" className="h-10 w-10 rounded-md object-cover" />
    );
  }
  if (signedUrl) {
    return (
      <Image
        src={signedUrl}
        alt=""
        width={40}
        height={40}
        className="h-10 w-10 rounded-md object-cover"
        unoptimized
      />
    );
  }
  return <div className="h-10 w-10 rounded-md bg-lp-bg-tertiary" />;
}

function BlobFill({ blob }: { blob: Blob }) {
  const [u, setU] = useState('');
  useEffect(() => {
    const url = URL.createObjectURL(blob);
    queueMicrotask(() => setU(url));
    return () => URL.revokeObjectURL(url);
  }, [blob]);
  if (!u) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- blob preview
    <img src={u} alt="" className="absolute inset-0 h-full w-full object-contain" />
  );
}

export function MobileReceiptCapture() {
  const router = useRouter();
  const { showToast } = useToast();
  const {
    selectedTourId,
    selectedTour,
    tourRouting,
    isRoutingLoading,
  } = useArtistTourContext();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [desktopRedirected, setDesktopRedirected] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('GBP');
  const [category, setCategory] = useState<string>(RECEIPT_CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [showDateChoice, setShowDateChoice] = useState<'yesterday' | 'today' | 'tomorrow' | 'custom'>(
    'today'
  );
  const [customDate, setCustomDate] = useState(() => localTodayIso());
  const [cityOverride, setCityOverride] = useState('');
  const [recent, setRecent] = useState<
    (Expense & { receipt_signed_url?: string | null; pending?: boolean; pendingBlob?: Blob })[]
  >([]);
  const [detail, setDetail] = useState<
    | (Expense & { receipt_signed_url?: string | null; pending?: boolean; pendingBlob?: Blob })
    | null
  >(null);

  const lastSubmitRef = useRef<{ city: string | null; country: string | null; currency: string } | null>(
    null
  );

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(LAST_EXP_SUBMIT_KEY);
      if (raw) lastSubmitRef.current = JSON.parse(raw) as typeof lastSubmitRef.current;
    } catch {
      lastSubmitRef.current = null;
    }
  }, []);

  const tourId = selectedTourId;
  const today = useMemo(() => localTodayIso(), []);
  const yesterday = useMemo(() => addDaysIso(today, -1), [today]);
  const tomorrow = useMemo(() => addDaysIso(today, 1), [today]);

  const resolvedDateIso = useMemo(() => {
    if (showDateChoice === 'yesterday') return yesterday;
    if (showDateChoice === 'tomorrow') return tomorrow;
    if (showDateChoice === 'custom') return customDate;
    return today;
  }, [showDateChoice, yesterday, tomorrow, today, customDate]);

  const auto = useMemo(() => {
    return autoDetectForDate(
      tourRouting,
      resolvedDateIso,
      selectedTour?.currency ?? 'GBP',
      lastSubmitRef.current
    );
  }, [tourRouting, resolvedDateIso, selectedTour?.currency]);

  useEffect(() => {
    setCurrency(auto.currency);
    if (!cityOverride) setCityOverride(auto.city ?? '');
  }, [auto.currency, auto.city, cityOverride]);

  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  useEffect(() => {
    queueMicrotask(() => {
      if (typeof window !== 'undefined' && window.innerWidth >= 768 && tourId) {
        router.replace(`/tours/${tourId}?expenseFlow=1`);
        setDesktopRedirected(true);
      }
    });
  }, [router, tourId]);

  const loadRecent = useCallback(async () => {
    if (!tourId) return;
    const res = await fetch(`/api/expenses?tour_id=${encodeURIComponent(tourId)}&limit=10`);
    if (!res.ok) return;
    const j = (await res.json()) as { expenses: (Expense & { receipt_signed_url?: string })[] };
    const server = j.expenses ?? [];
    const pend = (await getPendingExpenses()).filter((p) => p.payload.tour_id === tourId);
    const pendingRows: (Expense & {
      receipt_signed_url?: string | null;
      pending?: boolean;
      pendingBlob?: Blob;
    })[] = pend.map((p) => ({
        id: p.id,
        workspace_id: '',
        tour_id: p.payload.tour_id,
        show_id: p.payload.show_id ?? null,
        amount: p.payload.amount,
        currency: p.payload.currency,
        category: p.payload.category,
        description: p.payload.description ?? null,
        spent_at: p.payload.spent_at,
        city: p.payload.city ?? null,
        country: p.payload.country ?? null,
        receipt_url: null,
        receipt_filename: p.filename,
        submitted_by: null,
        submitted_at: new Date(p.enqueuedAt).toISOString(),
        person_id: p.payload.person_id ?? null,
        status: 'pending',
        notes: null,
        created_at: new Date(p.enqueuedAt).toISOString(),
        updated_at: new Date(p.enqueuedAt).toISOString(),
        pending: true,
        pendingBlob: p.photoBlob,
      })
    );
    const merged = [...pendingRows, ...server].slice(0, 12);
    setRecent(merged);
  }, [tourId]);

  useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  const onPickPhoto = () => fileInputRef.current?.click();

  const onFile = (f: File | null) => {
    if (!f) return;
    setPhoto(f);
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
  };

  const submit = async (exitAfter: boolean) => {
    if (!tourId) {
      showToast('Select a tour in the sidebar first');
      return;
    }
    if (!photo) {
      showToast('Add a receipt photo');
      return;
    }
    const amt = parseAmount(amount);
    if (amt == null) {
      showToast('Enter a valid amount');
      return;
    }

    const id = crypto.randomUUID();
    const spentAt = spentAtISOFromLocalDate(resolvedDateIso);
    const city = (cityOverride || auto.city || '').trim() || null;
    const country = auto.country;

    const payload: ExpenseInput = {
      id,
      tour_id: tourId,
      show_id: auto.routingId,
      amount: amt,
      currency,
      category,
      description: description.trim() || null,
      spent_at: spentAt,
      city,
      country,
      person_id: null,
    };

    const offline = typeof navigator !== 'undefined' && !navigator.onLine;

    try {
      if (offline) {
        await enqueueExpense(payload, photo, photo.name || 'receipt.jpg');
        showToast('Receipt saved — will sync when you are online');
      } else {
        const fd = new FormData();
        fd.set('id', payload.id);
        fd.set('tour_id', payload.tour_id);
        if (payload.show_id) fd.set('show_id', payload.show_id);
        fd.set('amount', String(payload.amount));
        fd.set('currency', payload.currency);
        fd.set('category', payload.category);
        if (payload.description) fd.set('description', payload.description);
        fd.set('spent_at', payload.spent_at);
        if (payload.city) fd.set('city', payload.city);
        if (payload.country) fd.set('country', payload.country);
        fd.set('file', photo, photo.name);
        const res = await fetch('/api/expenses', { method: 'POST', body: fd });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error ?? 'Save failed');
        }
        showToast('Receipt saved');
      }

      try {
        sessionStorage.setItem(LAST_EXP_SUBMIT_KEY, JSON.stringify({ city, country, currency }));
        lastSubmitRef.current = { city, country, currency };
      } catch {
        /* ignore */
      }

      setPhoto(null);
      setPhotoPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setAmount('');
      setDescription('');
      await loadRecent();

      if (exitAfter && tourId) {
        router.push(`/tours/${tourId}`);
      }
    } catch (e) {
      showToast((e as Error).message ?? 'Could not save', 'error');
    }
  };

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longFiredRef = useRef(false);
  const [submitMenu, setSubmitMenu] = useState(false);

  if (desktopRedirected) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6 text-sm text-lp-text-secondary">
        Opening tour…
      </div>
    );
  }

  if (!tourId) {
    return (
      <div className="mx-auto max-w-md p-6">
        <p className="text-sm text-lp-text-secondary">
          Choose a tour from the workspace scope, then return here to capture receipts.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-lg flex-col bg-lp-bg pb-28">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-lp-border bg-lp-surface/95 px-4 py-3 backdrop-blur">
        <button
          type="button"
          className="text-sm font-medium text-lp-text-secondary"
          onClick={() => router.back()}
        >
          Cancel
        </button>
        <h1 className="text-sm font-semibold text-lp-text">New receipt</h1>
        <div className="relative">
          <button
            type="button"
            className="rounded-full bg-lp-orange px-3 py-1.5 text-sm font-semibold text-white"
            onPointerDown={() => {
              longFiredRef.current = false;
              longPressTimer.current = setTimeout(() => {
                longFiredRef.current = true;
                setSubmitMenu(true);
              }, 500);
            }}
            onPointerUp={() => {
              if (longPressTimer.current) {
                clearTimeout(longPressTimer.current);
                longPressTimer.current = null;
              }
              if (!longFiredRef.current) void submit(false);
            }}
            onPointerCancel={() => {
              if (longPressTimer.current) {
                clearTimeout(longPressTimer.current);
                longPressTimer.current = null;
              }
            }}
            onPointerLeave={() => {
              if (longPressTimer.current) {
                clearTimeout(longPressTimer.current);
                longPressTimer.current = null;
              }
            }}
          >
            Submit
          </button>
          {submitMenu ? (
            <>
              <button
                type="button"
                className="fixed inset-0 z-40 bg-black/20"
                aria-label="Close menu"
                onClick={() => setSubmitMenu(false)}
              />
              <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-xl border border-lp-border bg-lp-surface p-2 shadow-lg">
                <button
                  type="button"
                  className="block w-full rounded-lg px-3 py-2 text-left text-xs text-lp-text hover:bg-lp-surface-hover"
                  onClick={() => {
                    setSubmitMenu(false);
                    void submit(false);
                  }}
                >
                  Submit and stay on form
                </button>
                <button
                  type="button"
                  className="block w-full rounded-lg px-3 py-2 text-left text-xs text-lp-text hover:bg-lp-surface-hover"
                  onClick={() => {
                    setSubmitMenu(false);
                    void submit(true);
                  }}
                >
                  Submit and exit to tour
                </button>
              </div>
            </>
          ) : null}
        </div>
      </header>

      <div className="flex-1 space-y-5 p-4">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        />

        <button
          type="button"
          onClick={onPickPhoto}
          className="flex aspect-[4/3] w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-lp-border bg-lp-surface"
        >
          {photoPreview ? (
            // eslint-disable-next-line @next/next/no-img-element -- blob URL preview
            <img src={photoPreview} alt="" className="max-h-56 w-full object-contain p-2" />
          ) : (
            <span className="text-sm text-lp-text-secondary">Tap to capture receipt</span>
          )}
        </button>

        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-lp-text-tertiary">
            Amount
          </span>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1 w-full rounded-xl border border-lp-border bg-lp-surface px-3 py-3 text-2xl font-semibold text-lp-text"
            placeholder="0.00"
          />
          {amount ? (
            <span className="mt-1 block text-xs text-lp-text-secondary">{formatPreview(amount, currency)}</span>
          ) : null}
        </label>

        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-lp-text-tertiary">
            Currency
          </span>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="mt-1 w-full rounded-xl border border-lp-border bg-lp-surface px-3 py-2.5 text-sm text-lp-text"
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-lp-text-tertiary">
            Category
          </span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="mt-1 w-full rounded-xl border border-lp-border bg-lp-surface px-3 py-2.5 text-sm text-lp-text"
          >
            {RECEIPT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-lp-text-tertiary">
            Show date
          </span>
          <div className="mt-1 flex flex-wrap gap-2">
            {(['yesterday', 'today', 'tomorrow'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setShowDateChoice(k)}
                className={`rounded-lg px-3 py-2 text-xs font-medium ${
                  showDateChoice === k
                    ? 'bg-lp-orange text-white'
                    : 'border border-lp-border bg-lp-surface text-lp-text'
                }`}
              >
                {k === 'yesterday' ? 'Yesterday' : k === 'today' ? 'Today' : 'Tomorrow'}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowDateChoice('custom')}
              className={`rounded-lg px-3 py-2 text-xs font-medium ${
                showDateChoice === 'custom'
                  ? 'bg-lp-orange text-white'
                  : 'border border-lp-border bg-lp-surface text-lp-text'
              }`}
            >
              Pick…
            </button>
          </div>
          {showDateChoice === 'custom' ? (
            <input
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              className="mt-2 w-full rounded-xl border border-lp-border bg-lp-surface px-3 py-2 text-sm"
            />
          ) : null}
          {isRoutingLoading ? (
            <p className="mt-1 text-xs text-lp-text-tertiary">Loading tour days…</p>
          ) : null}
        </div>

        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-lp-text-tertiary">
            City (auto)
          </span>
          <input
            value={cityOverride}
            onChange={(e) => setCityOverride(e.target.value)}
            className="mt-1 w-full rounded-xl border border-lp-border bg-lp-surface px-3 py-2.5 text-sm text-lp-text"
            placeholder={auto.city ?? 'City'}
          />
        </label>

        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-lp-text-tertiary">
            Description (optional)
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-xl border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text"
          />
        </label>
      </div>

      <section className="border-t border-lp-border bg-lp-surface p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-lp-text-tertiary">
          Recent
        </h2>
        <ul className="mt-2 space-y-2">
          {recent.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setDetail(r)}
                className="flex w-full items-center gap-3 rounded-xl border border-lp-border bg-lp-bg px-2 py-2 text-left"
              >
                <ReceiptThumb pendingBlob={r.pendingBlob ?? null} signedUrl={r.receipt_signed_url ?? null} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-lp-text">
                    {formatAmountNum(r.amount, r.currency)} · {r.category}
                  </p>
                  {r.pending ? (
                    <span className="text-[10px] text-amber-600">Syncing…</span>
                  ) : null}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {detail ? (
        <div className="fixed inset-0 z-[60] flex flex-col bg-lp-bg">
          <div className="flex items-center justify-between border-b border-lp-border px-4 py-3">
            <button type="button" className="text-sm font-medium text-lp-text" onClick={() => setDetail(null)}>
              Close
            </button>
            <span className="text-sm font-semibold">Receipt</span>
            <span className="w-10" />
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {detail.pendingBlob ?? detail.receipt_signed_url ? (
              <div className="relative mx-auto aspect-[3/4] max-w-md">
                {detail.pendingBlob ? (
                  <BlobFill blob={detail.pendingBlob} />
                ) : detail.receipt_signed_url ? (
                  <Image
                    src={detail.receipt_signed_url}
                    alt=""
                    fill
                    sizes="(max-width: 768px) 100vw, 28rem"
                    className="object-contain"
                    unoptimized
                  />
                ) : null}
              </div>
            ) : null}
            <p className="mt-4 text-lg font-bold">{formatAmountNum(detail.amount, detail.currency)}</p>
            <p className="text-sm text-lp-text-secondary">{detail.category}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

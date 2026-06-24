'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Lightbulb, Pencil, Trash2, AlertTriangle, Sparkles } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  nightsBetweenHotelStay,
  hotelRateDenominatorNights,
  impliedRatePerNight,
} from '@/lib/hotel-rate';
import { InlineEditCell } from '@/components/spreadsheet-view/InlineEditCell';
import { RoutingDateField } from '@/components/spreadsheet-view/RoutingDateField';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';
import { detectAiCap, aiCapMessage } from '@/lib/ai/client';
import { useSuggestionsPreference } from './useSuggestionsPreference';
import type { BudgetFinding } from '@/lib/budget/rules';

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'quoted', label: 'Quoted' },
  { value: 'approved', label: 'Approved' },
  { value: 'paid', label: 'Paid' },
  { value: 'disputed', label: 'Disputed' },
];

const CATEGORY_LABELS: Record<string, string> = {
  hotels: 'Hotels',
  flights: 'Flights',
  transport_bus: 'Transport > Bus + Truck',
  transport_taxis: 'Transport > Taxis',
  transport_fuel: 'Transport > Fuel',
  transport_parking: 'Transport > Parking',
  transport_misc: 'Transport > Misc',
  transport_agent: 'Transport > Travel Agent',
  prod_audio: 'Production > Audio + Backline',
  prod_lighting: 'Production > Lighting',
  prod_freight: 'Production > Freight',
  prod_equipment: 'Production > Equipment',
  prod_programming: 'Production > Programming',
  prod_set_wardrobe: 'Production > Set + Wardrobe',
  prod_misc: 'Production > Misc',
  misc: 'Misc',
};

function categoryBreadcrumb(cat: string): string {
  return CATEGORY_LABELS[cat] ?? cat.replace(/_/g, ' ');
}

interface LineItemDetailPanelProps {
  lineItemId: string | null;
  tourId: string;
  onClose: () => void;
}

type TabId = 'overview' | 'files' | 'links' | 'history' | 'rooms';

interface LineItemRow {
  id: string;
  category: string;
  label: string;
  proposed_cost?: number;
  actual_cost?: number;
  status?: string;
  routing_id?: string | null;
  source_entity_type?: string | null;
  source_entity_id?: string | null;
}

interface HotelRoomAssignmentRow {
  id: string;
  person_name: string;
  room_type: string | null;
  check_in: string | null;
  check_out: string | null;
  nights: number;
  rate_per_night: number | null;
  confirmation: string | null;
  notes: string | null;
}

interface AttachmentRow {
  id: string;
  file_name: string;
  file_url: string;
  file_type?: string | null;
  file_size_bytes?: number | null;
  uploaded_at: string;
}

interface NoteRow {
  id: string;
  content: string;
  created_by?: string | null;
  created_at: string;
  note_type: string;
  author?: { id: string; name: string | null; avatar_url: string | null } | null;
}

export function LineItemDetailPanel({ lineItemId, tourId, onClose }: LineItemDetailPanelProps) {
  const { showToast } = useToast();
  const [lineItem, setLineItem] = useState<LineItemRow | null>(null);
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [linkedItems, setLinkedItems] = useState<LineItemRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<TabId>('overview');
  const [noteDraft, setNoteDraft] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deletingLineItem, setDeletingLineItem] = useState(false);
  const filesInputRef = useRef<HTMLInputElement>(null);
  const [routingContext, setRoutingContext] = useState<{ date: string; venue_name?: string } | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsDismissed, setSuggestionsDismissed] = useState<Set<number>>(new Set());
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  // AI assistant gate (opt-in). `enabled` resolves the per-user
  // preference over the workspace default; the panel only auto-fires
  // when it's true. A manual trigger is always available regardless.
  const { enabled: suggestionsEnabled, loaded: prefLoaded } = useSuggestionsPreference();
  const [assistantRequested, setAssistantRequested] = useState(false);
  const [findings, setFindings] = useState<BudgetFinding[]>([]);
  const [findingsDismissed, setFindingsDismissed] = useState<Set<string>>(new Set());
  const [rooms, setRooms] = useState<HotelRoomAssignmentRow[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [hotelBooking, setHotelBooking] = useState<{
    id: string;
    hotel_name: string;
    city: string | null;
    check_in_date: string | null;
    check_out_date: string | null;
    total_assignment_nights: number;
  } | null>(null);

  const initialsFor = (name: string | null | undefined, fallback: string = '?') => {
    const n = (name ?? '').trim();
    if (!n) return fallback;
    return n.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  };

  const fmtStamp = (iso: string) =>
    iso ? new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

  const fetchDetails = useCallback(async (opts?: { background?: boolean }) => {
    if (!lineItemId) return;
    const background = Boolean(opts?.background);
    if (!background) setLoading(true);
    try {
      const res = await fetch(`/api/budget/line-items/${lineItemId}/details`);
      if (!res.ok) throw new Error('Failed to load');
      const json = await res.json();
      setLineItem(json.line_item);
      setAttachments(json.attachments ?? []);
      setNotes(json.notes ?? []);
      setLinkedItems(json.linked_items ?? []);
      setHotelBooking(json.hotel_booking ?? null);
      if (json.line_item?.routing_id) {
        const rRes = await fetch(`/api/tours/${tourId}/routing`);
        if (rRes.ok) {
          const rJson = await rRes.json();
          const list = Array.isArray(rJson) ? rJson : (rJson.routing ?? []);
          const routing = list.find((r: { id: string }) => r.id === json.line_item.routing_id);
          if (routing) setRoutingContext({ date: routing.date, venue_name: routing.venue_name });
        }
      } else {
        setRoutingContext(null);
      }
    } catch {
      setLineItem(null);
    } finally {
      if (!background) setLoading(false);
    }
  }, [lineItemId, tourId]);

  useEffect(() => {
    if (!lineItemId) return;
    const refresh = () => {
      void fetchDetails({ background: true });
    };
    window.addEventListener('lp-budget-line-item-updated', refresh);
    window.addEventListener('lp-hotel-booking-updated', refresh);
    return () => {
      window.removeEventListener('lp-budget-line-item-updated', refresh);
      window.removeEventListener('lp-hotel-booking-updated', refresh);
    };
  }, [lineItemId, fetchDetails]);

  useEffect(() => {
    if (lineItemId) {
      setTab('overview');
      // Reset the assistant surface on open / line-item switch so a
      // disabled panel shows the manual trigger (not stale results).
      setAssistantRequested(false);
      setSuggestions([]);
      setSuggestionsDismissed(new Set());
      setFindings([]);
      setFindingsDismissed(new Set());
      fetchDetails();
    } else {
      setLineItem(null);
      setAttachments([]);
      setNotes([]);
      setLinkedItems([]);
      setSuggestions([]);
      setSuggestionsDismissed(new Set());
      setFindings([]);
      setFindingsDismissed(new Set());
      setHotelBooking(null);
    }
  }, [lineItemId, fetchDetails]);

  useEffect(() => {
    if (tab !== 'rooms' || lineItem?.source_entity_type !== 'hotel_booking' || !lineItem.source_entity_id) {
      return;
    }
    setRoomsLoading(true);
    fetch(`/api/budget/hotels/assignments?hotel_booking_id=${lineItem.source_entity_id}`)
      .then((r) => r.json())
      .then((data: { assignments?: HotelRoomAssignmentRow[] }) => setRooms(data.assignments ?? []))
      .catch(() => setRooms([]))
      .finally(() => setRoomsLoading(false));
  }, [tab, lineItem?.source_entity_type, lineItem?.source_entity_id]);

  const fetchSuggestions = useCallback(async () => {
    if (!lineItemId || !tourId) return;
    setSuggestionsLoading(true);
    setSuggestions([]);
    try {
      const res = await fetch('/api/budget/ai/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tour_id: tourId,
          line_item: { id: lineItemId },
          context: lineItem ? { category: lineItem.category, label: lineItem.label, proposed_cost: lineItem.proposed_cost } : undefined,
        }),
      });
      const cap = await detectAiCap(res);
      if (cap) {
        showToast(aiCapMessage(cap), 'error');
        setSuggestions([]);
        return;
      }
      const json = await res.json().catch(() => ({}));
      setSuggestions(Array.isArray(json.suggestions) ? json.suggestions : []);
      setSuggestionsDismissed(new Set());
    } catch {
      setSuggestions([]);
    } finally {
      setSuggestionsLoading(false);
    }
  }, [lineItemId, tourId, lineItem, showToast]);

  // Deterministic rules findings (free; no model call). Tour-scoped, so
  // the same for every line item in the tour.
  const fetchRules = useCallback(async () => {
    if (!tourId) return;
    try {
      const res = await fetch('/api/budget/rules-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tour_id: tourId }),
      });
      if (!res.ok) {
        setFindings([]);
        return;
      }
      const json = await res.json().catch(() => ({}));
      setFindings(Array.isArray(json.findings) ? json.findings : []);
      setFindingsDismissed(new Set());
    } catch {
      setFindings([]);
    }
  }, [tourId]);

  // Fire the whole assistant surface (rules + LLM suggestions). Used by
  // both the opt-in auto-fire and the always-available manual trigger.
  const runAssistant = useCallback(() => {
    setAssistantRequested(true);
    void fetchSuggestions();
    void fetchRules();
  }, [fetchSuggestions, fetchRules]);

  useEffect(() => {
    // Opt-in gate: auto-fire only once the preference resolves to true.
    if (lineItem && lineItemId && prefLoaded && suggestionsEnabled) {
      runAssistant();
    }
  }, [lineItemId, lineItem?.id, prefLoaded, suggestionsEnabled]); // eslint-disable-line react-hooks/exhaustive-deps -- only when panel opens / line item changes / preference flips on

  const saveStatus = useCallback(async (newValue: string | number) => {
    if (!lineItemId) return;
    const res = await fetch('/api/budget/line-items', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: lineItemId, status: String(newValue) }),
    });
    if (res.ok && lineItem) {
      setLineItem({ ...lineItem, status: String(newValue) });
      window.dispatchEvent(new CustomEvent('lp-budget-line-item-updated'));
    }
  }, [lineItemId, lineItem]);

  const saveLabel = useCallback(async (newValue: string | number) => {
    if (!lineItemId) return;
    const label = String(newValue);
    const res = await fetch('/api/budget/line-items', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: lineItemId, label }),
    });
    if (res.ok && lineItem) {
      setLineItem({ ...lineItem, label });
      if (lineItem.source_entity_type === 'hotel_booking') {
        setHotelBooking((prev) => (prev ? { ...prev, hotel_name: label.trim() } : null));
      }
      window.dispatchEvent(new CustomEvent('lp-budget-line-item-updated'));
      window.dispatchEvent(new CustomEvent('lp-hotel-booking-updated'));
    }
  }, [lineItemId, lineItem]);

  const persistHotelBookingFields = useCallback(
    async (patch: { city?: string | null; check_in_date?: string | null; check_out_date?: string | null }) => {
      const hid =
        lineItem?.source_entity_type === 'hotel_booking' ? lineItem.source_entity_id : null;
      if (!hid) return;
      const res = await fetch('/api/budget/hotels', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: hid, ...patch }),
      });
      if (!res.ok) throw new Error('Save failed');
      const updated = (await res.json()) as {
        city?: string | null;
        check_in_date?: string | null;
        check_out_date?: string | null;
      };
      setHotelBooking((prev) => (prev ? { ...prev, ...updated } : null));
      window.dispatchEvent(new CustomEvent('lp-hotel-booking-updated'));
    },
    [lineItem?.source_entity_type, lineItem?.source_entity_id]
  );

  const saveProposedCost = useCallback(
    async (newValue: string | number) => {
      if (!lineItemId) return;
      const res = await fetch('/api/budget/line-items', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: lineItemId, proposed_cost: Number(newValue) }),
      });
      if (!res.ok) throw new Error('Save failed');
      const d = (await res.json()) as { proposed_cost?: number | null; actual_cost?: number | null };
      setLineItem((prev) =>
        prev
          ? {
              ...prev,
              proposed_cost: Number(d.proposed_cost ?? 0),
              actual_cost: Number(d.actual_cost ?? prev.actual_cost ?? 0),
            }
          : null
      );
      window.dispatchEvent(new CustomEvent('lp-budget-line-item-updated'));
    },
    [lineItemId]
  );

  const saveActualCost = useCallback(
    async (newValue: string | number) => {
      if (!lineItemId) return;
      const res = await fetch('/api/budget/line-items', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: lineItemId, actual_cost: Number(newValue) }),
      });
      if (!res.ok) throw new Error('Save failed');
      const d = (await res.json()) as { proposed_cost?: number | null; actual_cost?: number | null };
      setLineItem((prev) =>
        prev
          ? {
              ...prev,
              proposed_cost: Number(d.proposed_cost ?? prev.proposed_cost ?? 0),
              actual_cost: Number(d.actual_cost ?? 0),
            }
          : null
      );
      window.dispatchEvent(new CustomEvent('lp-budget-line-item-updated'));
    },
    [lineItemId]
  );

  const saveRoomRate = useCallback(async (roomId: string, newValue: string | number) => {
    const res = await fetch('/api/budget/hotels/assignments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: roomId, rate_per_night: Number(newValue) }),
    });
    if (!res.ok) throw new Error('Save failed');
    const updated = (await res.json()) as HotelRoomAssignmentRow;
    setRooms((prev) => prev.map((r) => (r.id === roomId ? { ...r, ...updated } : r)));
    window.dispatchEvent(new CustomEvent('lp-budget-line-item-updated'));
  }, []);

  const addNote = useCallback(async () => {
    if (!lineItemId || !noteDraft.trim()) return;
    const res = await fetch(`/api/budget/line-items/${lineItemId}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: noteDraft.trim() }),
    });
    if (res.ok) {
      const created = await res.json();
      setNotes((prev) => [created, ...prev]);
      setNoteDraft('');
    }
  }, [lineItemId, noteDraft]);

  const saveNoteEdit = useCallback(async () => {
    if (!lineItemId || !editingNoteId) return;
    const text = editingNoteText.trim();
    if (!text) return;
    const optimisticId = editingNoteId;
    setNotes((prev) => prev.map((n) => (n.id === optimisticId ? { ...n, content: text } : n)));
    setEditingNoteId(null);
    setEditingNoteText('');
    const res = await fetch(`/api/budget/line-items/${lineItemId}/notes`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ noteId: optimisticId, content: text }),
    });
    if (res.ok) {
      const updated = await res.json();
      setNotes((prev) => prev.map((n) => (n.id === optimisticId ? updated : n)));
    } else {
      fetchDetails();
    }
  }, [lineItemId, editingNoteId, editingNoteText, fetchDetails]);

  const deleteNote = useCallback(async (noteId: string) => {
    if (!lineItemId) return;
    if (!window.confirm('Delete this note?')) return;
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
    const res = await fetch(`/api/budget/line-items/${lineItemId}/notes`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ noteId }),
    });
    if (!res.ok) fetchDetails();
  }, [lineItemId, fetchDetails]);

  const deleteAttachment = useCallback(async (attachmentId: string) => {
    if (!lineItemId) return;
    const res = await fetch(`/api/budget/line-items/${lineItemId}/attachments`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: attachmentId }),
    });
    if (res.ok) setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
  }, [lineItemId]);

  const uploadAttachmentFile = useCallback(
    async (file: File) => {
      if (!lineItemId || !file) return;
      setUploading(true);
      setUploadError(null);
      try {
        const form = new FormData();
        form.append('file', file);
        const res = await fetch(`/api/budget/line-items/${lineItemId}/attachments`, {
          method: 'POST',
          body: form,
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          const message =
            typeof payload?.error === 'string' && payload.error.trim().length > 0
              ? payload.error
              : `Upload failed (${res.status})`;
          setUploadError(message);
          return;
        }
        await fetchDetails();
      } finally {
        setUploading(false);
        if (filesInputRef.current) filesInputRef.current.value = '';
      }
    },
    [lineItemId, fetchDetails]
  );

  const onFilesInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void uploadAttachmentFile(file);
      e.target.value = '';
    },
    [uploadAttachmentFile]
  );

  const saveLinkedIds = useCallback(async (ids: string[]) => {
    if (!lineItemId) return;
    const res = await fetch('/api/budget/line-items', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: lineItemId, linked_item_ids: ids }),
    });
    if (res.ok) fetchDetails();
  }, [lineItemId, fetchDetails]);

  const openLinkedItem = useCallback((id: string) => {
    onClose();
    setTimeout(() => {
      const event = new CustomEvent('lp-open-line-item', { detail: { id } });
      window.dispatchEvent(event);
    }, 0);
  }, [onClose]);

  const deleteLineItem = useCallback(async () => {
    if (!lineItemId || !lineItem) return;
    if (!window.confirm(`Delete "${lineItem.label}"? This cannot be undone.`)) return;
    setDeletingLineItem(true);
    try {
      const res = await fetch('/api/budget/line-items', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: lineItemId }),
      });
      if (!res.ok) throw new Error('Delete failed');
      window.dispatchEvent(new CustomEvent('lp-line-item-deleted', { detail: { id: lineItemId } }));
      onClose();
    } finally {
      setDeletingLineItem(false);
    }
  }, [lineItemId, lineItem, onClose]);

  if (!lineItemId) return null;

  const panelTabs: TabId[] = [
    'overview',
    'files',
    'links',
    'history',
    ...(lineItem?.source_entity_type === 'hotel_booking' ? (['rooms'] as const) : []),
  ];

  const currency = 'GBP';
  const formatter = new Intl.NumberFormat('en-GB', { style: 'currency', currency, minimumFractionDigits: 2 });

  // Assistant surface is empty when, after a fetch, neither a rules
  // finding nor an LLM suggestion remains visible.
  const visibleFindingsCount = findings.filter((f) => !findingsDismissed.has(f.id)).length;
  const visibleSuggestionsCount = suggestions.filter((_, i) => !suggestionsDismissed.has(i)).length;
  const assistantEmpty =
    !suggestionsLoading && visibleFindingsCount === 0 && visibleSuggestionsCount === 0;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/20 z-40 md:block"
        aria-hidden
        onClick={onClose}
      />
      <div
        className={cn(
          'fixed top-0 right-0 h-full z-50 bg-lp-bg border-l border-lp-border shadow-2xl',
          'w-full md:w-[480px]',
          'transition-transform duration-200 ease-out',
          lineItemId ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {loading && !lineItem ? (
          <div className="p-6 text-lp-text-secondary">Loading…</div>
        ) : lineItem ? (
          <>
            <header className="sticky top-0 z-10 flex items-start justify-between gap-2 border-b border-lp-border bg-lp-bg p-4">
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-bold text-lp-text truncate">
                  <InlineEditCell
                    value={lineItem.label}
                    type="text"
                    onSave={saveLabel}
                  />
                </h2>
                <p className="mt-1 text-xs text-lp-text-secondary">
                  Category: {categoryBreadcrumb(lineItem.category)}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-lp-text-secondary">Status:</span>
                  <InlineEditCell
                    value={lineItem.status ?? 'draft'}
                    type="select"
                    options={STATUS_OPTIONS}
                    onSave={saveStatus}
                  />
                </div>
                <div className="mt-2 space-y-2">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-xs font-medium text-lp-text-secondary">Proposed</span>
                    <InlineEditCell
                      value={lineItem.proposed_cost ?? 0}
                      type="currency"
                      currency={currency}
                      align="left"
                      className="text-sm text-lp-text"
                      onSave={saveProposedCost}
                    />
                  </div>
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-xs font-medium text-lp-text-secondary">Actual</span>
                    <InlineEditCell
                      value={lineItem.actual_cost ?? 0}
                      type="currency"
                      currency={currency}
                      align="left"
                      className="text-sm text-lp-text"
                      onSave={saveActualCost}
                    />
                  </div>
                  {lineItem.source_entity_type === 'hotel_booking' ? (
                    <p className="text-xs text-lp-text-tertiary leading-snug">
                      {(() => {
                        const stayNights = hotelBooking
                          ? nightsBetweenHotelStay(
                              hotelBooking.check_in_date,
                              hotelBooking.check_out_date
                            )
                          : null;
                        const denom = hotelRateDenominatorNights(
                          stayNights,
                          hotelBooking?.total_assignment_nights ?? 0
                        );
                        const implied =
                          denom > 0
                            ? impliedRatePerNight(
                                lineItem.proposed_cost,
                                lineItem.actual_cost,
                                denom
                              )
                            : null;
                        if (implied == null) {
                          return 'Rate/night in the grid uses proposed (or actual when set) ÷ stay nights from check-in/out.';
                        }
                        return `Implied rate/night from line totals ÷ stay nights (${denom}): ${formatter.format(implied)}.`;
                      })()}
                    </p>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-lp-text-secondary">
                  Applies to: {routingContext ? `${routingContext.date}${routingContext.venue_name ? ` · ${routingContext.venue_name}` : ''}` : 'Whole tour'}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded text-lp-text-secondary hover:bg-lp-surface hover:text-lp-text"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <nav className="flex border-b border-lp-border/50 text-xs font-semibold">
              {panelTabs.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={cn(
                    'px-4 py-2 capitalize',
                    tab === t ? 'border-b-2 border-lp-orange text-lp-orange' : 'text-lp-text-secondary hover:text-lp-text'
                  )}
                >
                  {t === 'overview'
                    ? 'Overview'
                    : t === 'files'
                      ? 'Files'
                      : t === 'links'
                        ? 'Links'
                        : t === 'rooms'
                          ? 'Rooms'
                          : 'History'}
                </button>
              ))}
            </nav>

            <div className="overflow-y-auto p-4 min-h-[200px]">
              {tab === 'overview' && (
                <div className="space-y-4">
                  {lineItem.source_entity_type === 'hotel_booking' && hotelBooking ? (
                    <div className="rounded-xl border border-lp-border bg-lp-surface/50 p-4 space-y-3">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-lp-text-secondary">Hotel stay</h3>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                          <p className="text-[11px] font-medium text-lp-text-secondary mb-1">City</p>
                          <InlineEditCell
                            value={hotelBooking.city ?? ''}
                            type="text"
                            placeholder="City"
                            onSave={async (v) => {
                              await persistHotelBookingFields({
                                city: String(v).trim() ? String(v).trim() : null,
                              });
                            }}
                          />
                        </div>
                        <div>
                          <p className="text-[11px] font-medium text-lp-text-secondary mb-1">Check-in</p>
                          <RoutingDateField
                            tourId={tourId}
                            value={hotelBooking.check_in_date}
                            onChange={async (iso) => {
                              if (!iso) return;
                              await persistHotelBookingFields({ check_in_date: iso.slice(0, 10) });
                            }}
                          />
                        </div>
                        <div>
                          <p className="text-[11px] font-medium text-lp-text-secondary mb-1">Check-out</p>
                          <RoutingDateField
                            tourId={tourId}
                            value={hotelBooking.check_out_date}
                            onChange={async (iso) => {
                              if (!iso) return;
                              await persistHotelBookingFields({ check_out_date: iso.slice(0, 10) });
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-lp-text-secondary mb-2">Notes</h3>
                    <div className="space-y-2">
                      {notes.filter((n) => n.note_type === 'note').map((n) => (
                        <div
                          key={n.id}
                          className="group rounded-xl border border-lp-border bg-lp-surface/50 p-3 space-y-1.5"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <div
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                                style={{ backgroundColor: n.author?.avatar_url ? 'transparent' : '#FF4500' }}
                              >
                                {n.author?.avatar_url ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={n.author.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover" />
                                ) : (
                                  initialsFor(n.author?.name ?? null)
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-baseline gap-2">
                                  <span className="text-[13px] font-semibold text-lp-text truncate">
                                    {n.author?.name ?? 'Unknown'}
                                  </span>
                                  <span className="text-[11px] text-lp-text-tertiary shrink-0">
                                    {fmtStamp(n.created_at)}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingNoteId(n.id);
                                  setEditingNoteText(n.content ?? '');
                                }}
                                className="rounded p-1 text-lp-text-tertiary hover:text-lp-text"
                                aria-label="Edit note"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteNote(n.id)}
                                className="rounded p-1 text-lp-text-tertiary hover:text-red-500"
                                aria-label="Delete note"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>

                          {editingNoteId === n.id ? (
                            <div className="space-y-2">
                              <textarea
                                value={editingNoteText}
                                onChange={(e) => setEditingNoteText(e.target.value)}
                                rows={3}
                                className="w-full rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text placeholder:text-lp-text-secondary"
                              />
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={saveNoteEdit}
                                  disabled={!editingNoteText.trim()}
                                  className="rounded bg-lp-orange px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setEditingNoteId(null); setEditingNoteText(''); }}
                                  className="rounded border border-lp-border px-3 py-1.5 text-sm font-medium text-lp-text hover:bg-lp-surface"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p className="text-[13px] text-lp-text-secondary leading-relaxed whitespace-pre-wrap">
                              {n.content}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="mt-3">
                      <textarea
                        value={noteDraft}
                        onChange={(e) => setNoteDraft(e.target.value)}
                        placeholder="Add a note…"
                        rows={3}
                        className="w-full rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text placeholder:text-lp-text-secondary"
                      />
                      <button
                        type="button"
                        onClick={addNote}
                        disabled={!noteDraft.trim()}
                        className="mt-2 text-lp-orange text-sm font-semibold hover:underline disabled:opacity-50"
                      >
                        Save note
                      </button>
                    </div>
                  </div>

                  <div className="mt-6">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-lp-text-secondary">AI suggestions</h3>
                      {assistantRequested && !suggestionsLoading && (
                        <button
                          type="button"
                          onClick={runAssistant}
                          className="text-xs font-semibold text-lp-orange hover:underline"
                        >
                          Refresh
                        </button>
                      )}
                    </div>

                    {!assistantRequested ? (
                      /* Always-available on-demand path — opt-out removes the
                         automatic firing, not this manual trigger. */
                      <div className="space-y-2">
                        <button
                          type="button"
                          onClick={runAssistant}
                          className="inline-flex items-center gap-2 rounded-lg border border-lp-border bg-lp-surface/60 px-3 py-2 text-sm font-semibold text-lp-text hover:border-lp-orange/45 hover:bg-lp-orange/[0.04]"
                        >
                          <Sparkles className="h-4 w-4 text-lp-orange" />
                          Get suggestions
                        </button>
                        <p className="text-xs text-lp-text-tertiary">
                          {suggestionsEnabled
                            ? 'Checking for suggestions…'
                            : 'AI suggestions are off — fetch them on demand any time.'}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {/* Deterministic rules findings, above the LLM suggestions. */}
                        {findings.map((f) =>
                          findingsDismissed.has(f.id) ? null : (
                            <div
                              key={f.id}
                              className="flex items-start gap-2 rounded-lg border border-lp-border bg-amber-500/5 px-3 py-2 text-sm"
                            >
                              <AlertTriangle
                                className={cn(
                                  'h-4 w-4 shrink-0 mt-0.5',
                                  f.severity === 'warn' ? 'text-amber-500' : 'text-lp-text-tertiary'
                                )}
                              />
                              <div className="min-w-0 flex-1">
                                <p className="font-semibold text-lp-text">{f.title}</p>
                                <p className="text-lp-text-secondary">{f.detail}</p>
                                {f.suggestedAction ? (
                                  /* TODO: wire to a line-item create path once one
                                     exists; informational only for now (no write
                                     surface invented in this ticket). */
                                  <p className="mt-1 text-xs text-lp-text-tertiary">
                                    Suggested: add “{f.suggestedAction.label}”.
                                  </p>
                                ) : null}
                              </div>
                              <button
                                type="button"
                                onClick={() => setFindingsDismissed((prev) => new Set(prev).add(f.id))}
                                className="shrink-0 text-lp-text-tertiary hover:text-lp-text"
                                aria-label="Dismiss"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          )
                        )}

                        {/* LLM suggestions. */}
                        {suggestionsLoading ? (
                          <p className="text-sm text-lp-text-tertiary">Loading…</p>
                        ) : (
                          <>
                            {suggestions.map((s, i) =>
                              suggestionsDismissed.has(i) ? null : (
                                <div
                                  key={i}
                                  className="flex items-start gap-2 rounded-lg border border-lp-border bg-amber-500/5 px-3 py-2 text-sm"
                                >
                                  <Lightbulb className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
                                  <span className="flex-1 text-lp-text">{s}</span>
                                  <button
                                    type="button"
                                    onClick={() => setSuggestionsDismissed((prev) => new Set(prev).add(i))}
                                    className="shrink-0 text-lp-text-tertiary hover:text-lp-text"
                                    aria-label="Dismiss"
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                </div>
                              )
                            )}
                            {assistantEmpty && (
                              <p className="text-sm text-lp-text-tertiary">No suggestions right now.</p>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {tab === 'files' && (
                <div className="space-y-4">
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'copy';
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const file = e.dataTransfer.files?.[0];
                      if (file) void uploadAttachmentFile(file);
                    }}
                    className="rounded-xl border-2 border-dashed border-lp-border bg-lp-surface/50 px-4 py-6 text-center transition-colors hover:border-lp-orange/45 hover:bg-lp-orange/[0.04]"
                  >
                    <button
                      type="button"
                      disabled={uploading}
                      onClick={() => filesInputRef.current?.click()}
                      className="rounded-lg bg-lp-orange px-4 py-2 text-sm font-semibold text-white hover:bg-lp-orange-hover disabled:opacity-50"
                    >
                      {uploading ? 'Uploading…' : 'Upload'}
                    </button>
                    <input
                      ref={filesInputRef}
                      type="file"
                      className="sr-only"
                      accept=".pdf,.png,.jpg,.jpeg,.gif,.doc,.docx,.xls,.xlsx"
                      disabled={uploading}
                      onChange={onFilesInputChange}
                    />
                    <p className="mt-2 text-xs text-lp-text-secondary">or drag and drop a file here (max 10MB)</p>
                  </div>

                  <div>
                    <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-lp-text-secondary">
                      Uploaded files
                    </h3>
                    {uploadError ? (
                      <p className="mb-2 text-xs font-medium text-red-500">{uploadError}</p>
                    ) : null}
                  </div>
                  {attachments.length === 0 ? (
                    <p className="text-sm text-lp-text-tertiary">No attachments yet.</p>
                  ) : (
                    <ul className="overflow-hidden rounded-xl border border-lp-border">
                      {attachments.map((a) => (
                        <li
                          key={a.id}
                          className="flex flex-wrap items-center gap-2 border-b border-lp-border px-4 py-3 last:border-b-0 hover:bg-lp-surface-hover/60"
                        >
                          <a
                            href={a.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="min-w-0 flex-1 break-all text-sm font-semibold text-lp-orange underline decoration-lp-orange/55 underline-offset-2 hover:decoration-lp-orange"
                          >
                            {a.file_name}
                          </a>
                          <span className="shrink-0 text-xs text-lp-text-secondary tabular-nums">
                            {a.file_size_bytes != null ? `${(a.file_size_bytes / 1024).toFixed(1)} KB` : '—'} ·{' '}
                            {a.uploaded_at ? new Date(a.uploaded_at).toLocaleDateString('en-GB') : '—'}
                          </span>
                          <button
                            type="button"
                            onClick={() => deleteAttachment(a.id)}
                            className="shrink-0 text-xs text-lp-text-tertiary hover:text-lp-error"
                          >
                            Delete
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {tab === 'links' && (
                <div className="space-y-3">
                  {linkedItems.map((li) => (
                    <button
                      key={li.id}
                      type="button"
                      onClick={() => openLinkedItem(li.id)}
                      className="w-full text-left rounded-lg border border-lp-border bg-lp-surface/50 px-3 py-2 text-sm hover:bg-lp-surface"
                    >
                      <span className="font-medium text-lp-text">{li.label}</span>
                      <span className="ml-2 text-xs text-lp-text-secondary">{categoryBreadcrumb(li.category)}</span>
                      <span className="block text-xs text-lp-text-secondary mt-0.5">
                        {formatter.format(li.proposed_cost ?? 0)} / {formatter.format(li.actual_cost ?? 0)}
                      </span>
                    </button>
                  ))}
                  <p className="text-xs text-lp-text-secondary">
                    + Link item: use Spreadsheet view to link items (PATCH linked_item_ids).
                  </p>
                </div>
              )}

              {tab === 'history' && (
                <div className="space-y-2">
                  {notes
                    .filter((n) => ['status_change', 'approval', 'system'].includes(n.note_type))
                    .map((n) => (
                      <div key={n.id} className="text-sm text-lp-text-secondary border-l border-lp-border pl-3 py-1">
                        {n.created_at ? new Date(n.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''} — {n.content}
                      </div>
                    ))}
                  {notes.filter((n) => ['status_change', 'approval', 'system'].includes(n.note_type)).length === 0 && (
                    <p className="text-sm text-lp-text-secondary">No history yet.</p>
                  )}
                </div>
              )}

              {tab === 'rooms' && (
                <div className="space-y-3">
                  <p className="text-[10px] font-semibold uppercase tracking-widest lp-table-header-text">
                    Room Assignments
                  </p>
                  {roomsLoading ? (
                    <p className="text-sm text-lp-text-tertiary">Loading…</p>
                  ) : rooms.length === 0 ? (
                    <p className="text-sm text-lp-text-tertiary">No rooms assigned yet.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-lp-border bg-lp-surface">
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="border-b border-lp-border">
                            <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-widest lp-table-header-text">Person</th>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-widest lp-table-header-text">Room type</th>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-widest lp-table-header-text">Check-in</th>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-widest lp-table-header-text">Check-out</th>
                            <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-widest lp-table-header-text">Nights</th>
                            <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-widest lp-table-header-text">Rate/night</th>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-widest lp-table-header-text">Ref</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rooms.map((room) => (
                            <tr key={room.id} className="border-b border-lp-border/30 hover:bg-lp-surface-hover">
                              <td className="px-3 py-2 text-lp-text">{room.person_name}</td>
                              <td className="px-3 py-2 text-lp-text-secondary">{room.room_type ?? '—'}</td>
                              <td className="px-3 py-2 tabular-nums text-lp-text-secondary">
                                {room.check_in ? formatDate(room.check_in) : '—'}
                              </td>
                              <td className="px-3 py-2 tabular-nums text-lp-text-secondary">
                                {room.check_out ? formatDate(room.check_out) : '—'}
                              </td>
                              <td className="px-3 py-2 tabular-nums text-right text-lp-text">{room.nights}</td>
                              <td className="px-3 py-2 text-right text-lp-text-secondary" onClick={(e) => e.stopPropagation()}>
                                <InlineEditCell
                                  type="currency"
                                  currency={currency}
                                  align="right"
                                  value={room.rate_per_night ?? 0}
                                  className="text-sm"
                                  onSave={(v) => saveRoomRate(room.id, v)}
                                />
                              </td>
                              <td className="px-3 py-2 text-lp-text-tertiary text-xs">{room.confirmation ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {(lineItem.category.startsWith('transport_') ||
                lineItem.category.startsWith('prod_') ||
                lineItem.category === 'misc') && (
                <div className="mt-8 border-t border-lp-border pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      void deleteLineItem();
                    }}
                    disabled={deletingLineItem}
                    className="w-full rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-500 hover:bg-red-500/15 disabled:opacity-50"
                  >
                    {deletingLineItem ? 'Deleting line item…' : 'Delete line item'}
                  </button>
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}

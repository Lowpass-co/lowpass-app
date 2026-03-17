'use client';

import { useCallback, useEffect, useState } from 'react';
import { X, Lightbulb } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { InlineEditCell } from '@/components/spreadsheet-view/InlineEditCell';
import { cn } from '@/lib/utils';

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

type TabId = 'overview' | 'files' | 'links' | 'history';

interface LineItemRow {
  id: string;
  category: string;
  label: string;
  proposed_cost?: number;
  actual_cost?: number;
  status?: string;
  routing_id?: string | null;
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
}

export function LineItemDetailPanel({ lineItemId, tourId, onClose }: LineItemDetailPanelProps) {
  const [lineItem, setLineItem] = useState<LineItemRow | null>(null);
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [linkedItems, setLinkedItems] = useState<LineItemRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<TabId>('overview');
  const [noteDraft, setNoteDraft] = useState('');
  const [uploading, setUploading] = useState(false);
  const [routingContext, setRoutingContext] = useState<{ date: string; venue_name?: string } | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsDismissed, setSuggestionsDismissed] = useState<Set<number>>(new Set());
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  const fetchDetails = useCallback(async () => {
    if (!lineItemId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/budget/line-items/${lineItemId}/details`);
      if (!res.ok) throw new Error('Failed to load');
      const json = await res.json();
      setLineItem(json.line_item);
      setAttachments(json.attachments ?? []);
      setNotes(json.notes ?? []);
      setLinkedItems(json.linked_items ?? []);
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
      setLoading(false);
    }
  }, [lineItemId, tourId]);

  useEffect(() => {
    if (lineItemId) {
      setTab('overview');
      fetchDetails();
    } else {
      setLineItem(null);
      setAttachments([]);
      setNotes([]);
      setLinkedItems([]);
      setSuggestions([]);
      setSuggestionsDismissed(new Set());
    }
  }, [lineItemId, fetchDetails]);

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
      const json = await res.json().catch(() => ({}));
      setSuggestions(Array.isArray(json.suggestions) ? json.suggestions : []);
      setSuggestionsDismissed(new Set());
    } catch {
      setSuggestions([]);
    } finally {
      setSuggestionsLoading(false);
    }
  }, [lineItemId, tourId, lineItem]);

  useEffect(() => {
    if (lineItem && lineItemId) {
      fetchSuggestions();
    }
  }, [lineItemId, lineItem?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- only when panel opens / line item changes

  const saveStatus = useCallback(async (newValue: string | number) => {
    if (!lineItemId) return;
    const res = await fetch('/api/budget/line-items', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: lineItemId, status: String(newValue) }),
    });
    if (res.ok && lineItem) setLineItem({ ...lineItem, status: String(newValue) });
  }, [lineItemId, lineItem]);

  const saveLabel = useCallback(async (newValue: string | number) => {
    if (!lineItemId) return;
    const res = await fetch('/api/budget/line-items', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: lineItemId, label: String(newValue) }),
    });
    if (res.ok && lineItem) setLineItem({ ...lineItem, label: String(newValue) });
  }, [lineItemId, lineItem]);

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

  const deleteAttachment = useCallback(async (attachmentId: string) => {
    if (!lineItemId) return;
    const res = await fetch(`/api/budget/line-items/${lineItemId}/attachments`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: attachmentId }),
    });
    if (res.ok) setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
  }, [lineItemId]);

  const uploadFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!lineItemId || !file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`/api/budget/line-items/${lineItemId}/attachments`, {
        method: 'POST',
        body: form,
      });
      if (res.ok) {
        const created = await res.json();
        setAttachments((prev) => [created, ...prev]);
      }
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }, [lineItemId]);

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

  if (!lineItemId) return null;

  const currency = 'GBP';
  const formatter = new Intl.NumberFormat('en-GB', { style: 'currency', currency, minimumFractionDigits: 2 });

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
                <p className="mt-2 text-sm text-lp-text">
                  Proposed: {formatter.format(lineItem.proposed_cost ?? 0)} · Actual: {formatter.format(lineItem.actual_cost ?? 0)}
                </p>
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
              {(['overview', 'files', 'links', 'history'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={cn(
                    'px-4 py-2 capitalize',
                    tab === t ? 'border-b-2 border-lp-orange text-lp-orange' : 'text-lp-text-secondary hover:text-lp-text'
                  )}
                >
                  {t === 'overview' ? 'Overview' : t === 'files' ? 'Files' : t === 'links' ? 'Links' : 'History'}
                </button>
              ))}
            </nav>

            <div className="overflow-y-auto p-4 min-h-[200px]">
              {tab === 'overview' && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-lp-text-secondary mb-2">Notes</h3>
                    <div className="space-y-2">
                      {notes.filter((n) => n.note_type === 'note').map((n) => (
                        <div key={n.id} className="rounded-lg border border-lp-border/50 bg-lp-surface/30 p-3 text-sm">
                          <p className="text-lp-text whitespace-pre-wrap">{n.content}</p>
                          <p className="mt-1 text-xs text-lp-text-secondary">
                            {n.created_at ? new Date(n.created_at).toLocaleString('en-GB') : ''}
                          </p>
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
                    <h3 className="text-xs font-bold uppercase tracking-wider text-lp-text-secondary mb-2">AI suggestions</h3>
                    {suggestionsLoading ? (
                      <p className="text-sm text-lp-text-tertiary">Loading…</p>
                    ) : (
                      <ul className="space-y-2">
                        {suggestions.map((s, i) =>
                          suggestionsDismissed.has(i) ? null : (
                            <li
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
                            </li>
                          )
                        )}
                        {suggestions.length === 0 && !suggestionsLoading && (
                          <p className="text-sm text-lp-text-tertiary">No suggestions right now.</p>
                        )}
                      </ul>
                    )}
                  </div>
                </div>
              )}

              {tab === 'files' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    {attachments.map((a) => (
                      <div
                        key={a.id}
                        className="flex flex-col rounded-lg border border-lp-border bg-lp-surface/50 p-3"
                      >
                        <a
                          href={a.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium text-lp-orange hover:underline truncate"
                        >
                          {a.file_name}
                        </a>
                        <p className="text-xs text-lp-text-secondary mt-0.5">
                          {a.file_size_bytes != null ? `${(a.file_size_bytes / 1024).toFixed(1)} KB` : ''} · {a.uploaded_at ? new Date(a.uploaded_at).toLocaleDateString('en-GB') : ''}
                        </p>
                        <button
                          type="button"
                          onClick={() => deleteAttachment(a.id)}
                          className="mt-1 text-xs text-lp-text-secondary hover:text-lp-error"
                        >
                          × Delete
                        </button>
                      </div>
                    ))}
                  </div>
                  <label className="block">
                    <span className="text-lp-orange text-sm font-semibold hover:underline cursor-pointer">
                      {uploading ? 'Uploading…' : 'Click to upload file'}
                    </span>
                    <input
                      type="file"
                      className="sr-only"
                      accept=".pdf,.png,.jpg,.jpeg,.gif,.doc,.docx,.xls,.xlsx"
                      disabled={uploading}
                      onChange={uploadFile}
                    />
                  </label>
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
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}

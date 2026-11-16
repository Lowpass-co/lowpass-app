'use client';

/* A Member's tour access, on the Manage slide-over. Explicit Save: changing
   what someone can open is a deliberate act, not an auto-save. */
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-client';
import { TourAccessEditor, EMPTY_DRAFT, draftToRows, rowsToDraft, type AccessDraft } from './TourAccessEditor';

export function MemberTourAccess({ memberId }: { memberId: string }) {
  const [draft, setDraft] = useState<AccessDraft>(EMPTY_DRAFT);
  const [saved, setSaved] = useState<string>('');
  const [tours, setTours] = useState<{ id: string; name: string }[]>([]);
  const [state, setState] = useState<'loading' | 'idle' | 'saving' | 'error'>('loading');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void createClient()
      .from('tours')
      .select('id, name')
      .order('start_date', { ascending: false })
      .then(({ data }) => {
        if (live) setTours(((data ?? []) as { id: string; name: string | null }[]).map((t) => ({ id: t.id, name: t.name ?? 'Untitled tour' })));
      });
    void fetch(`/api/workspaces/members/${memberId}/access`)
      .then((r) => r.json())
      .then((b: { rows?: { tour_id: string | null; area: string; level: string }[]; error?: string }) => {
        if (!live) return;
        if (!b.rows) {
          setState('error');
          setMessage(b.error ?? 'Could not load access');
          return;
        }
        const d = rowsToDraft(b.rows);
        setDraft(d);
        setSaved(JSON.stringify(draftToRows(d)));
        setState('idle');
      })
      .catch(() => live && (setState('error'), setMessage('Could not load access')));
    return () => {
      live = false;
    };
  }, [memberId]);

  const dirty = JSON.stringify(draftToRows(draft)) !== saved;

  async function save() {
    setState('saving');
    setMessage(null);
    const rows = draftToRows(draft);
    const res = await fetch(`/api/workspaces/members/${memberId}/access`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows }),
    });
    const b = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      setState('error');
      setMessage(b?.error ?? `Save failed (${res.status})`);
      return;
    }
    setSaved(JSON.stringify(rows));
    setState('idle');
    setMessage('Saved');
  }

  return (
    <div>
      <div className="lp-label-caps" style={{ fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-secondary)', marginBottom: 'var(--lp-space-2)' }}>
        Tour access
      </div>
      <TourAccessEditor value={draft} onChange={setDraft} tours={tours} disabled={state === 'loading' || state === 'saving'} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 'var(--lp-space-2)', marginTop: 'var(--lp-space-2)' }}>
        {message ? (
          <span role={state === 'error' ? 'alert' : 'status'} style={{ fontSize: 'var(--lp-text-xs)', color: state === 'error' ? 'var(--color-lp-error)' : 'var(--lp-text-tertiary)' }}>
            {message}
          </span>
        ) : null}
        <button
          type="button"
          onClick={save}
          disabled={!dirty || state === 'saving' || state === 'loading'}
          className="btn-transition"
          style={{
            fontSize: 'var(--lp-text-sm)',
            padding: 'var(--lp-space-1) var(--lp-space-3)',
            borderRadius: 'var(--lp-radius-md)',
            border: '1px solid var(--color-lp-orange)',
            background: dirty ? 'var(--color-lp-orange)' : 'transparent',
            color: dirty ? 'var(--lp-text-inverse)' : 'var(--lp-text-tertiary)',
            cursor: dirty ? 'pointer' : 'default',
          }}
        >
          {state === 'saving' ? 'Saving…' : 'Save access'}
        </button>
      </div>
    </div>
  );
}

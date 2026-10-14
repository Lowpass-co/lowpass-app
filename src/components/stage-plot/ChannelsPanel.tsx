/* ============================================
   LOWPASS — <ChannelsPanel> (Oct 2026)

   The stage plot editor's Channels tab (beside the icon palette). Linking
   used to mean selecting one item and picking channels from a dropdown, one
   at a time, with no view of what was placed. Now the channel list drives it:

   - every input channel, in channel-list order, with where it sits on the
     plot (or "not placed");
   - drag a channel onto an item → linked (a channel lives in one place, so
     it moves off whatever item had it);
   - drag a channel onto empty stage → drops a mic / DI already linked;
   - "Link by name" suggestions (only clear best matches) in one click;
   - click a placed channel → selects its item(s) on the plot;
   - "New channel" writes a REAL row to the paired channel list.

   Presentational: the editor owns items + channels and passes callbacks.
   ============================================ */
'use client';

import { useMemo, useState } from 'react';
import { getIcon } from '@/lib/stage-plot/icons';
import { suggestLinks, type LinkSuggestion } from '@/lib/stage-plot/channelLinks';
import { CHANNEL_DRAG_TYPE } from '@/components/stage-plot/StageCanvas';
import type { Channel, EditorItem } from '@/lib/stage-plot/editor-types';

export interface ChannelsPanelProps {
  channels: Channel[];
  items: EditorItem[];
  /** A channel list is paired (new channels have somewhere to go). */
  canCreate: boolean;
  onCreate: (label: string) => Promise<void>;
  onApplySuggestions: (links: LinkSuggestion[]) => void;
  onSelectItems: (ids: string[]) => void;
  channelListHref?: string;
}

const itemName = (it: EditorItem): string => it.label || getIcon(it.iconName)?.label || it.iconName;

export function ChannelsPanel({ channels, items, canCreate, onCreate, onApplySuggestions, onSelectItems, channelListHref }: ChannelsPanelProps) {
  const [unplacedOnly, setUnplacedOnly] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());

  // channel id → the items it's linked to
  const placedOn = useMemo(() => {
    const m = new Map<string, EditorItem[]>();
    for (const it of items) for (const id of it.channelRowIds ?? []) m.set(id, [...(m.get(id) ?? []), it]);
    return m;
  }, [items]);
  const suggestions = useMemo(() => suggestLinks(channels, items, getIcon), [channels, items]);
  const chosen = suggestions.filter((s) => !skipped.has(s.channelId));
  const placedCount = channels.filter((c) => placedOn.has(c.id)).length;
  const shown = unplacedOnly ? channels.filter((c) => !placedOn.has(c.id)) : channels;

  const create = async () => {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await onCreate(name);
      setNewName('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not add the channel');
    } finally {
      setBusy(false);
    }
  };

  const small: React.CSSProperties = { fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)' };

  if (channels.length === 0 && !canCreate) {
    return (
      <div style={{ padding: 12, ...small, lineHeight: 1.5 }}>
        No channel list is paired with this plot. Pair one with <span style={{ color: 'var(--lp-text-secondary)' }}>Channel list</span> at the top, then drag its channels onto the stage.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ padding: '10px 10px 8px', borderBottom: '1px solid var(--lp-border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text)', fontFamily: 'var(--lp-font-numeric)' }}>
            {placedCount} of {channels.length} on the plot
          </span>
          {channelListHref ? (
            <a href={channelListHref} style={{ ...small, color: 'var(--lp-text-secondary)' }} title="Channel numbers follow the channel list — reorder there">Open list ↗</a>
          ) : null}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, ...small, color: 'var(--lp-text-secondary)', cursor: 'pointer' }}>
          <input type="checkbox" className="lp-checkbox" checked={unplacedOnly} onChange={(e) => setUnplacedOnly(e.target.checked)} />
          Not placed only
        </label>
        <span style={{ ...small, lineHeight: 1.4 }}>Drag a channel onto an item to link it, or onto the stage to drop a mic.</span>
      </div>

      {suggestions.length > 0 ? (
        <div style={{ padding: 10, borderBottom: '1px solid var(--lp-border)', background: 'var(--lp-surface)' }}>
          <div style={{ fontSize: 'var(--lp-text-2xs)', fontWeight: 600, color: 'var(--lp-text-secondary)', marginBottom: 6 }}>Link by name</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 150, overflowY: 'auto' }}>
            {suggestions.map((s) => {
              const ch = channels.find((c) => c.id === s.channelId);
              const it = items.find((i) => i.id === s.itemId);
              if (!ch || !it) return null;
              return (
                <label key={s.channelId} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    className="lp-checkbox"
                    checked={!skipped.has(s.channelId)}
                    onChange={(e) => setSkipped((prev) => { const n = new Set(prev); if (e.target.checked) n.delete(s.channelId); else n.add(s.channelId); return n; })}
                  />
                  <span style={{ fontFamily: 'var(--lp-font-numeric)', color: 'var(--lp-text-tertiary)', minWidth: 16 }}>{ch.number}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ch.label} → {itemName(it)}</span>
                </label>
              );
            })}
          </div>
          <button
            type="button"
            disabled={chosen.length === 0}
            onClick={() => { onApplySuggestions(chosen); setSkipped(new Set()); }}
            style={{ marginTop: 8, width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid var(--lp-border)', background: 'var(--lp-bg)', color: chosen.length ? 'var(--lp-text)' : 'var(--lp-text-tertiary)', cursor: chosen.length ? 'pointer' : 'default', fontSize: 'var(--lp-text-xs)' }}
          >
            Link {chosen.length} {chosen.length === 1 ? 'channel' : 'channels'}
          </button>
        </div>
      ) : null}

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 0' }}>
        {shown.length === 0 ? <p style={{ ...small, padding: '8px 10px' }}>{unplacedOnly ? 'Every channel is on the plot.' : 'No channels yet.'}</p> : null}
        {shown.map((c) => {
          const on = placedOn.get(c.id) ?? [];
          return (
            <div
              key={c.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(CHANNEL_DRAG_TYPE, c.id);
                e.dataTransfer.effectAllowed = 'link';
              }}
              onClick={() => on.length && onSelectItems(on.map((i) => i.id))}
              title={on.length ? 'Click to select it on the plot · drag to move it' : 'Drag onto an item or the stage'}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 10px', cursor: 'grab', borderBottom: '1px solid var(--lp-border)' }}
            >
              <span style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, background: c.color || 'var(--lp-border-strong)' }} />
              <span style={{ fontFamily: 'var(--lp-font-numeric)', fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-secondary)', minWidth: 18, textAlign: 'right' }}>{c.number}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.label}</span>
                <span style={{ display: 'block', ...small, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {on.length ? `on ${on.map(itemName).join(', ')}` : 'not placed'}
                  {c.mic || c.di ? ` · ${[c.mic, c.di].filter(Boolean).join(' / ')}` : ''}
                </span>
              </span>
              {on.length ? <span aria-label="placed" style={{ color: 'var(--lp-text-tertiary)', fontSize: 'var(--lp-text-xs)' }}>✓</span> : null}
            </div>
          );
        })}
      </div>

      <div style={{ padding: 10, borderTop: '1px solid var(--lp-border)' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            value={newName}
            disabled={!canCreate || busy}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void create(); }}
            placeholder={canCreate ? 'New channel…' : 'Pair a channel list first'}
            style={{ flex: 1, minWidth: 0, fontSize: 'var(--lp-text-xs)', padding: '5px 7px', borderRadius: 6, border: '1px solid var(--lp-border)', background: 'var(--lp-surface)', color: 'var(--lp-text)' }}
          />
          <button type="button" onClick={() => void create()} disabled={!canCreate || busy || !newName.trim()}
            style={{ fontSize: 'var(--lp-text-xs)', padding: '5px 9px', borderRadius: 6, border: '1px solid var(--lp-border)', background: 'var(--lp-surface)', color: 'var(--lp-text-secondary)', cursor: canCreate ? 'pointer' : 'default' }}>
            {busy ? '…' : 'Add'}
          </button>
        </div>
        {err ? <p style={{ fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-danger, #e5484d)', margin: '6px 0 0' }}>{err}</p> : null}
        {canCreate ? <p style={{ ...small, margin: '6px 0 0' }}>Added to the end of the paired channel list.</p> : null}
      </div>
    </div>
  );
}

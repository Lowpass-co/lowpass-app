'use client';

/* ============================================
   LOWPASS — Riders: the editor's state (rebuild, Nov 2026)

   Adam chose "live, per-block": every block saves on its own, against its
   version, 0.7 s after the last keystroke. Someone else's save arrives by
   Realtime (postgres_changes on rider_blocks, the database's rules apply)
   and replaces the block — unless I'm mid-edit on it, in which case my save
   gets 409 and the block asks whose wins ("Use theirs / Keep mine").
   Presence (who's in which block) and deletes / reloads travel on one
   broadcast channel per tour. Inserts are optimistic (client ids); a save
   that can't reach the server waits and retries; leaving the page flushes
   with keepalive.
   ============================================ */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase-client';
import { useRealtimeRows } from '@/lib/realtime/useRealtimeRows';
import { blockFromRow, emptyContent } from '@/lib/riders/blocks';
import { photoPathsIn } from '@/lib/riders/photos';
import { byPosition, keyAfter } from '@/lib/riders/position';
import { toSnapDoc } from '@/lib/riders/snapshot';
import type { BlockContentMap, BlockKind, RiderBlock, SnapDoc } from '@/lib/riders/types';
import type { RiderEditorData } from '@/server/riders/data';
import { ApiError, ridersApi } from './api';

export type SaveStatus = 'saved' | 'saving' | 'error' | 'offline';
export interface Peer {
  userId: string;
  name: string;
  blockId: string | null;
}
type Patch = Partial<Pick<RiderBlock, 'content' | 'from' | 'until' | 'position'>> & { kind?: BlockKind };

const SAVE_DELAY = 700;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const fields = (b: RiderBlock) => ({ kind: b.kind, content: b.content, position: b.position, from: b.from, until: b.until });
const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

export function useRiderEditor(initial: RiderEditorData, opts: { tourId: string; me: { id: string; name: string }; canEdit: boolean; onError: (msg: string) => void }) {
  const { tourId, me, canEdit, onError } = opts;
  const api = useMemo(() => ridersApi(tourId), [tourId]);
  const [data, setData] = useState(initial);
  const [blocks, setBlocks] = useState<Record<string, RiderBlock>>(() => Object.fromEntries(initial.blocks.map((b) => [b.id, b])));
  const blocksRef = useRef(blocks);
  const serverVersion = useRef<Record<string, number>>(Object.fromEntries(initial.blocks.map((b) => [b.id, b.version])));
  const dirty = useRef(new Set<string>());
  const inflight = useRef(new Set<string>());
  const again = useRef(new Set<string>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const [conflicts, setConflicts] = useState<Record<string, RiderBlock>>({});
  const conflictsRef = useRef(conflicts);
  conflictsRef.current = conflicts;
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState<'error' | 'offline' | null>(null);
  const [focus, setFocusState] = useState<{ id: string; field?: string; at: number } | null>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  // Item photos: signed URLs by storage path (the page load signs the ones it
  // has; a photo that arrives later — mine or someone else's — is signed then).
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>(initial.photoUrls ?? {});
  const askedPhotos = useRef(new Set<string>(Object.keys(initial.photoUrls ?? {})));
  const channel = useRef<RealtimeChannel | null>(null);
  const focusRef = useRef<string | null>(null);

  const setB = useCallback((fn: (prev: Record<string, RiderBlock>) => Record<string, RiderBlock>) => {
    setBlocks((prev) => {
      const next = fn(prev);
      blocksRef.current = next;
      return next;
    });
  }, []);
  const bump = useCallback(() => setPending(dirty.current.size + inflight.current.size), []);

  /* ---------- saving ---------- */

  const save = useCallback(
    async (id: string, keepalive = false): Promise<void> => {
      const b = blocksRef.current[id];
      if (!b || conflictsRef.current[id]) return;
      const sv = serverVersion.current[id];
      if (!sv) return; // not inserted yet: the insert sends the latest content
      if (inflight.current.has(id)) {
        again.current.add(id);
        return;
      }
      inflight.current.add(id);
      dirty.current.delete(id);
      bump();
      const sent = fields(b);
      try {
        const { block } = await api.patch({ id, ifVersion: sv, ...sent }, keepalive);
        serverVersion.current[id] = block.version;
        setB((prev) => {
          const cur = prev[id];
          if (!cur) return prev;
          return { ...prev, [id]: same(fields(cur), sent) ? block : { ...cur, version: block.version } };
        });
        setFailed(null);
      } catch (e) {
        const err = e as ApiError;
        if (err.status === 409 && err.code === 'STALE' && err.current) {
          setConflicts((c) => ({ ...c, [id]: err.current as RiderBlock }));
        } else if (err.status === 404) {
          setB((prev) => {
            const n = { ...prev };
            delete n[id];
            return n;
          });
          onError('Someone deleted a block you were editing.');
        } else {
          dirty.current.add(id);
          setFailed(err.code === 'OFFLINE' ? 'offline' : 'error');
          if (err.status === 403) onError(err.message);
          else {
            const t = setTimeout(() => void save(id), 5000);
            timers.current.set(id, t);
          }
        }
      } finally {
        inflight.current.delete(id);
        if (again.current.has(id)) {
          again.current.delete(id);
          dirty.current.add(id);
          const t = setTimeout(() => void save(id), 150);
          timers.current.set(id, t);
        }
        bump();
      }
    },
    [api, bump, onError, setB],
  );

  const schedule = useCallback(
    (id: string, delay = SAVE_DELAY) => {
      dirty.current.add(id);
      bump();
      const t = timers.current.get(id);
      if (t) clearTimeout(t);
      timers.current.set(
        id,
        setTimeout(() => {
          timers.current.delete(id);
          void save(id);
        }, delay),
      );
    },
    [bump, save],
  );

  /* ---------- inserting (batched, optimistic) ---------- */

  const insertQueue = useRef(new Map<string, string[]>()); // riderId → ids
  const insertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushInserts = useCallback(async () => {
    insertTimer.current = null;
    const batches = [...insertQueue.current.entries()];
    insertQueue.current.clear();
    for (const [riderId, ids] of batches) {
      const rows = ids.map((id) => blocksRef.current[id]).filter(Boolean);
      if (!rows.length) continue;
      rows.forEach((r) => inflight.current.add(r.id));
      bump();
      try {
        const { blocks: saved } = await api.insert(riderId, rows.map((r) => ({ id: r.id, ...fields(r) })));
        for (const s of saved) {
          serverVersion.current[s.id] = s.version;
          const sent = rows.find((r) => r.id === s.id);
          const cur = blocksRef.current[s.id];
          if (cur && sent && !same(fields(cur), fields(sent))) dirty.current.add(s.id);
        }
        setB((prev) => {
          const n = { ...prev };
          for (const s of saved) if (n[s.id] && !dirty.current.has(s.id)) n[s.id] = s;
          return n;
        });
        setFailed(null);
      } catch (e) {
        setB((prev) => {
          const n = { ...prev };
          for (const r of rows) delete n[r.id];
          return n;
        });
        onError((e as Error).message || 'Couldn’t add that — try again.');
      } finally {
        rows.forEach((r) => inflight.current.delete(r.id));
        for (const r of rows) if (dirty.current.has(r.id)) void save(r.id);
        bump();
      }
    }
  }, [api, bump, onError, save, setB]);

  const queueInsert = useCallback(
    (riderId: string, id: string) => {
      const list = insertQueue.current.get(riderId) ?? [];
      list.push(id);
      insertQueue.current.set(riderId, list);
      if (!insertTimer.current) insertTimer.current = setTimeout(() => void flushInserts(), 60);
    },
    [flushInserts],
  );

  /* ---------- the edits ---------- */

  const blocksOf = useCallback((riderId: string) => Object.values(blocks).filter((b) => b.riderId === riderId).sort(byPosition), [blocks]);

  const edit = useCallback(
    (id: string, patch: Patch) => {
      if (!canEdit) return;
      setB((prev) => {
        const cur = prev[id];
        if (!cur) return prev;
        return { ...prev, [id]: { ...cur, ...patch } as RiderBlock };
      });
      if (serverVersion.current[id]) schedule(id);
    },
    [canEdit, schedule, setB],
  );

  /** Merge into the block's LATEST content — for work that finishes later
   *  (a photo upload) while the line may have been typed in meanwhile. */
  const patchContent = useCallback(
    (id: string, patch: Record<string, unknown>) => {
      if (!canEdit) return;
      setB((prev) => {
        const cur = prev[id];
        if (!cur) return prev;
        return { ...prev, [id]: { ...cur, content: { ...cur.content, ...patch } } as RiderBlock };
      });
      if (serverVersion.current[id]) schedule(id);
    },
    [canEdit, schedule, setB],
  );

  const setFocus = useCallback((id: string | null, field?: string) => {
    setFocusState(id ? { id, field, at: Date.now() } : null);
  }, []);

  const insertAfter = useCallback(
    <K extends BlockKind>(riderId: string, afterId: string | null, kind: K, content?: BlockContentMap[K], dates?: { from: string | null; until: string | null }, field?: string): string | null => {
      if (!canEdit) return null;
      const list = Object.values(blocksRef.current).filter((b) => b.riderId === riderId).sort(byPosition);
      const index = afterId ? list.findIndex((b) => b.id === afterId) : -1;
      const id = newId();
      const block = { id, riderId, kind, position: keyAfter(list, afterId ? index : list.length - 1), content: content ?? emptyContent(kind), from: dates?.from ?? null, until: dates?.until ?? null, version: 0 } as RiderBlock;
      serverVersion.current[id] = 0;
      setB((prev) => ({ ...prev, [id]: block }));
      queueInsert(riderId, id);
      setFocus(id, field);
      return id;
    },
    [canEdit, queueInsert, setB, setFocus],
  );

  /** Insert at the very top of a document. */
  const insertFirst = useCallback(
    <K extends BlockKind>(riderId: string, kind: K): string | null => {
      if (!canEdit) return null;
      const list = Object.values(blocksRef.current).filter((b) => b.riderId === riderId).sort(byPosition);
      const id = newId();
      const block = { id, riderId, kind, position: keyAfter(list, -1), content: emptyContent(kind), from: null, until: null, version: 0 } as RiderBlock;
      serverVersion.current[id] = 0;
      setB((prev) => ({ ...prev, [id]: block }));
      queueInsert(riderId, id);
      setFocus(id);
      return id;
    },
    [canEdit, queueInsert, setB, setFocus],
  );

  const remove = useCallback(
    async (ids: string[]) => {
      if (!canEdit || !ids.length) return;
      const removed = ids.map((id) => blocksRef.current[id]).filter(Boolean);
      setB((prev) => {
        const n = { ...prev };
        for (const id of ids) delete n[id];
        return n;
      });
      for (const id of ids) {
        const t = timers.current.get(id);
        if (t) clearTimeout(t);
        dirty.current.delete(id);
      }
      bump();
      const saved = ids.filter((id) => serverVersion.current[id]);
      if (!saved.length) return;
      try {
        await api.remove(saved);
        void channel.current?.send({ type: 'broadcast', event: 'deleted', payload: { ids: saved } });
      } catch (e) {
        setB((prev) => ({ ...prev, ...Object.fromEntries(removed.map((b) => [b.id, b])) }));
        onError((e as Error).message || 'Couldn’t delete that.');
      }
    },
    [api, bump, canEdit, onError, setB],
  );

  const resolveConflict = useCallback(
    (id: string, keep: 'theirs' | 'mine') => {
      const theirs = conflictsRef.current[id];
      if (!theirs) return;
      setConflicts((c) => {
        const n = { ...c };
        delete n[id];
        return n;
      });
      conflictsRef.current = { ...conflictsRef.current };
      delete conflictsRef.current[id];
      serverVersion.current[id] = theirs.version;
      if (keep === 'theirs') {
        dirty.current.delete(id);
        setB((prev) => ({ ...prev, [id]: theirs }));
        bump();
      } else schedule(id, 0);
    },
    [bump, schedule, setB],
  );

  /* ---------- the whole page: refresh + actions ---------- */

  const refresh = useCallback(async () => {
    try {
      const fresh = await api.load();
      setData(fresh);
      setPhotoUrls((p) => ({ ...p, ...(fresh.photoUrls ?? {}) }));
      setB((prev) => {
        const next: Record<string, RiderBlock> = {};
        for (const b of fresh.blocks) {
          const mine = prev[b.id];
          if (mine && (dirty.current.has(b.id) || inflight.current.has(b.id) || conflictsRef.current[b.id])) next[b.id] = mine;
          else {
            next[b.id] = b;
            serverVersion.current[b.id] = b.version;
          }
        }
        for (const [id, b] of Object.entries(prev)) if (!next[id] && serverVersion.current[id] === 0) next[id] = b; // inserting
        return next;
      });
    } catch (e) {
      onError((e as Error).message);
    }
  }, [api, onError, setB]);

  const action = useCallback(
    async <T = unknown>(body: Record<string, unknown>, opts2: { reloadOthers?: boolean } = {}): Promise<T> => {
      const out = await api.action<T>(body);
      await refresh();
      if (opts2.reloadOthers) void channel.current?.send({ type: 'broadcast', event: 'reload', payload: {} });
      return out;
    },
    [api, refresh],
  );

  /* ---------- live ---------- */

  useRealtimeRows({
    table: 'rider_blocks',
    filterColumn: 'tour_id',
    filterValue: tourId,
    events: ['INSERT', 'UPDATE'],
    onChange: (ev) => {
      if (!ev.new) return;
      const b = blockFromRow(ev.new);
      if (!b) return;
      const sv = serverVersion.current[b.id];
      if (sv !== undefined && b.version <= sv) return; // my own save, or older
      if (dirty.current.has(b.id) || inflight.current.has(b.id)) return; // my save will meet it (409)
      serverVersion.current[b.id] = b.version;
      setB((prev) => ({ ...prev, [b.id]: b }));
    },
  });
  // Replies / acks / versions from elsewhere → refresh the side panel.
  const lazyRefresh = useRef<ReturnType<typeof setTimeout> | null>(null);
  const soon = useCallback(() => {
    if (lazyRefresh.current) clearTimeout(lazyRefresh.current);
    lazyRefresh.current = setTimeout(() => void refresh(), 800);
  }, [refresh]);
  useRealtimeRows({ table: 'rider_replies', filterColumn: 'tour_id', filterValue: tourId, events: ['INSERT', 'UPDATE'], onChange: soon });
  useRealtimeRows({ table: 'rider_acks', filterColumn: 'tour_id', filterValue: tourId, events: ['INSERT'], onChange: soon });
  useRealtimeRows({ table: 'rider_versions', filterColumn: 'tour_id', filterValue: tourId, events: ['INSERT'], onChange: soon });

  useEffect(() => {
    const sb = createClient();
    const ch = sb.channel(`riders:${tourId}`, { config: { presence: { key: me.id }, broadcast: { self: false } } });
    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState() as Record<string, { name?: string; blockId?: string | null }[]>;
      setPeers(
        Object.entries(state)
          .filter(([uid]) => uid !== me.id)
          .map(([uid, metas]) => ({ userId: uid, name: metas[metas.length - 1]?.name ?? 'Someone', blockId: metas[metas.length - 1]?.blockId ?? null })),
      );
    });
    ch.on('broadcast', { event: 'deleted' }, ({ payload }) => {
      const ids = Array.isArray((payload as { ids?: unknown })?.ids) ? ((payload as { ids: unknown[] }).ids.filter((x) => typeof x === 'string') as string[]) : [];
      if (!ids.length) return;
      setB((prev) => {
        const n = { ...prev };
        for (const id of ids) delete n[id];
        return n;
      });
    });
    ch.on('broadcast', { event: 'reload' }, () => void refresh());
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') void ch.track({ name: me.name, blockId: focusRef.current });
    });
    channel.current = ch;
    return () => {
      channel.current = null;
      void sb.removeChannel(ch);
    };
  }, [tourId, me.id, me.name, refresh, setB]);

  useEffect(() => {
    focusRef.current = focus?.id ?? null;
    void channel.current?.track({ name: me.name, blockId: focus?.id ?? null });
  }, [focus?.id, me.name]);

  // Leaving the page: send what's still waiting.
  useEffect(() => {
    const flush = () => {
      for (const id of [...dirty.current]) void save(id, true);
    };
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [save]);

  useEffect(() => {
    const missing = photoPathsIn(Object.values(blocks)).filter((p) => !askedPhotos.current.has(p));
    if (!missing.length) return;
    for (const p of missing) askedPhotos.current.add(p);
    api
      .photoUrls(missing)
      .then(({ urls }) => setPhotoUrls((prev) => ({ ...prev, ...urls })))
      .catch(() => {
        for (const p of missing) askedPhotos.current.delete(p);
      });
  }, [blocks, api]);
  const addPhotoUrl = useCallback((path: string, url: string) => {
    askedPhotos.current.add(path);
    setPhotoUrls((p) => ({ ...p, [path]: url }));
  }, []);

  /* ---------- derived ---------- */

  const party = data.party.setting ?? (data.party.crew > 0 ? data.party.crew : null);
  const draftDocs: SnapDoc[] = useMemo(
    () => data.riders.map((r) => toSnapDoc({ kind: r.kind, title: r.title }, Object.values(blocks).filter((b) => b.riderId === r.id))),
    [blocks, data.riders],
  );
  const presenceByBlock = useMemo(() => {
    const m: Record<string, Peer[]> = {};
    for (const p of peers) if (p.blockId) (m[p.blockId] ??= []).push(p);
    return m;
  }, [peers]);
  const status: SaveStatus = failed ?? (pending > 0 ? 'saving' : 'saved');

  return {
    data,
    blocks,
    blocksOf,
    draftDocs,
    party,
    status,
    conflicts,
    peers,
    presenceByBlock,
    focus,
    setFocus,
    edit,
    patchContent,
    insertAfter,
    insertFirst,
    remove,
    resolveConflict,
    refresh,
    action,
    api,
    photoUrls,
    addPhotoUrl,
  };
}

export type RiderEditorStore = ReturnType<typeof useRiderEditor>;

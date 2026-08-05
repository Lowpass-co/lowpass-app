'use client';

/* ============================================
   LOWPASS — <PublicShowView> (rider decouple phase B4)

   The client half of /s/[token]. Mirrors PublicPacketView's
   token/password state machine, then renders the one-door show
   page:

     [header: artist · tour · date · day type · venue · city]
     [tabs: Advance form · Rider · Channel list · Stage plot · Downloads]

   Tab bodies reuse what already exists — the venue intake surface
   (iframe: it is its own clean branded page and the ONE intake code
   path), the B3 grouped ReadOnlyPackView for riders + channel lists,
   the server-rendered stage-plot SVG, and the bundled-PDF route
   (which honours show-link tokens since B4). Every tab fails soft:
   missing content explains itself, the page never dies on one tab.
   ============================================ */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Lock } from 'lucide-react';
import { ReadOnlyPackView } from '@/components/rider-pack/ReadOnlyPackView';
import type { PublicRiderPayload } from '@/lib/rider-packs/web-links';
import type { PacketManifest } from '@/lib/advance-packet/manifest';

type TabId = 'advance' | 'rider' | 'channel_list' | 'stage_plot' | 'downloads';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'advance', label: 'Advance form' },
  { id: 'rider', label: 'Rider' },
  { id: 'channel_list', label: 'Channel list' },
  { id: 'stage_plot', label: 'Stage plot' },
  { id: 'downloads', label: 'Downloads' },
];

interface ShowPayload {
  manifest: PacketManifest;
  payloads: PublicRiderPayload[];
  stage_plot_svg: string | null;
  intake_url: string | null;
  tour_id: string;
  routing_id: string;
  has_password: boolean;
}

type State =
  | { s: 'loading' }
  | { s: 'password'; invalid: boolean }
  | { s: 'error'; message: string }
  | { s: 'ready'; data: ShowPayload; password: string | null };

export function PublicShowView({ token }: { token: string }) {
  const [state, setState] = useState<State>({ s: 'loading' });
  const [pwInput, setPwInput] = useState('');
  const [tab, setTab] = useState<TabId>('advance');

  const load = useCallback(
    async (password: string | null) => {
      try {
        const res = await fetch(`/api/public/show-link/${encodeURIComponent(token)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(password ? { password } : {}),
        });
        const json = await res.json().catch(() => ({}));
        if (res.status === 401) {
          setState({ s: 'password', invalid: !!json.invalid_password });
          return;
        }
        if (!res.ok) {
          setState({ s: 'error', message: json.error ?? 'This link is not available.' });
          return;
        }
        setState({ s: 'ready', data: json as ShowPayload, password });
      } catch {
        setState({ s: 'error', message: 'Network error — try again.' });
      }
    },
    [token],
  );

  useEffect(() => {
    /* setTimeout(0) keeps the async setState out of the effect's own render
       pass — same shape PublicPacketView uses for the identical on-mount
       token fetch (react-hooks/set-state-in-effect). */
    const t = window.setTimeout(() => void load(null), 0);
    return () => window.clearTimeout(t);
  }, [load]);

  /* Riders vs channel lists, split once. The manifest's doc kinds are the
     authority; payload packs came back in manifest order. */
  const split = useMemo(() => {
    if (state.s !== 'ready') return { riders: [] as PublicRiderPayload[], channels: [] as PublicRiderPayload[] };
    const kindById = new Map(state.data.manifest.docs.map((d) => [d.id, d.kind]));
    const riders: PublicRiderPayload[] = [];
    const channels: PublicRiderPayload[] = [];
    for (const p of state.data.payloads) {
      (kindById.get(p.pack.id) === 'channel_list' ? channels : riders).push(p);
    }
    return { riders, channels };
  }, [state]);

  if (state.s === 'loading') {
    return <Frame><p className="p-8 text-center text-sm text-neutral-500">Loading show…</p></Frame>;
  }

  if (state.s === 'password') {
    return (
      <Frame>
        <form
          className="mx-auto max-w-sm space-y-3 p-8"
          onSubmit={(e) => {
            e.preventDefault();
            setState({ s: 'loading' });
            void load(pwInput);
          }}
        >
          <div className="flex items-center gap-2 text-neutral-700">
            <Lock className="h-4 w-4" />
            <span className="text-sm font-medium">This link is password-protected</span>
          </div>
          {state.invalid ? <p className="text-xs text-red-600">That password wasn’t right — try again.</p> : null}
          <input
            type="password"
            value={pwInput}
            onChange={(e) => setPwInput(e.target.value)}
            placeholder="Password"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            autoFocus
          />
          <button
            type="submit"
            className="w-full rounded-lg bg-[var(--lp-orange)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Open show
          </button>
        </form>
      </Frame>
    );
  }

  if (state.s === 'error') {
    return <Frame><p className="p-8 text-center text-sm text-neutral-500">{state.message}</p></Frame>;
  }

  const { data, password } = state;
  const { manifest } = data;
  const routing = manifest.routing;

  const pdfHref = (() => {
    const base = `/api/advance-packets/${encodeURIComponent(data.tour_id)}/${encodeURIComponent(data.routing_id)}/pdf`;
    const qs = new URLSearchParams({ token });
    if (password) qs.set('pw', password);
    return `${base}?${qs.toString()}`;
  })();

  return (
    <Frame wide>
      <header className="rounded-xl border border-neutral-200 bg-white p-6">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Show</p>
        <h1 className="mt-1 text-2xl font-bold text-neutral-900">
          {manifest.tour.artist_name ?? manifest.tour.name}
        </h1>
        <p className="text-sm text-neutral-600">
          {[
            manifest.tour.name,
            routing?.date ?? null,
            routing?.day_type ?? null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {(routing?.venue || routing?.city) && (
          <p className="mt-1 text-sm text-neutral-500">
            {[routing?.venue, routing?.city].filter(Boolean).join(' — ')}
          </p>
        )}
      </header>

      <nav className="sticky top-0 z-10 -mx-1 flex gap-1 overflow-x-auto border-b border-neutral-200 bg-neutral-50/95 px-1 py-2 backdrop-blur">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={
              tab === t.id
                ? 'whitespace-nowrap rounded-full bg-neutral-900 px-4 py-1.5 text-xs font-semibold text-white'
                : 'whitespace-nowrap rounded-full border border-neutral-200 bg-white px-4 py-1.5 text-xs font-semibold text-neutral-600 hover:border-neutral-400'
            }
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'advance' &&
        (data.intake_url ? (
          <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
            <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-2">
              <span className="text-xs font-medium text-neutral-600">Advance request form</span>
              <a href={data.intake_url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-[var(--lp-orange)] hover:underline">
                Open in its own tab ↗
              </a>
            </div>
            {/* The venue-intake surface IS the form — one code path, embedded. */}
            <iframe src={data.intake_url} title="Advance form" className="h-[75vh] w-full" />
          </div>
        ) : (
          <Empty>The tour team hasn’t opened the advance form for this show yet.</Empty>
        ))}

      {tab === 'rider' &&
        (split.riders.length > 0 ? (
          <div className="space-y-8">
            {split.riders.map((p) => (
              <div key={p.pack.id} className="overflow-hidden rounded-xl border border-neutral-200">
                <ReadOnlyPackView payload={p} />
              </div>
            ))}
          </div>
        ) : (
          <Empty>No rider is attached to this show yet.</Empty>
        ))}

      {tab === 'channel_list' &&
        (split.channels.length > 0 ? (
          <div className="space-y-8">
            {split.channels.map((p) => (
              <div key={p.pack.id} className="overflow-hidden rounded-xl border border-neutral-200">
                <ReadOnlyPackView payload={p} />
              </div>
            ))}
          </div>
        ) : (
          <Empty>No channel list is attached to this show yet.</Empty>
        ))}

      {tab === 'stage_plot' &&
        (data.stage_plot_svg ? (
          <div
            className="overflow-auto rounded-xl border border-neutral-200 bg-white p-4 [&_svg]:h-auto [&_svg]:max-w-full"
            /* Server-rendered by lib/stage-plot/stageplot-svg (same output the
               PDF export embeds) — not venue-supplied markup. */
            dangerouslySetInnerHTML={{ __html: data.stage_plot_svg }}
          />
        ) : (
          <Empty>No stage plot is attached to this show yet.</Empty>
        ))}

      {tab === 'downloads' && (
        <div className="rounded-xl border border-neutral-200 bg-white p-6">
          <p className="text-sm text-neutral-600">
            Everything above, as one PDF — rider{split.channels.length ? ' + channel list' : ''} bundled in show order.
          </p>
          <a
            href={pdfHref}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[var(--lp-orange)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            <Download className="h-4 w-4" />
            Download bundled PDF
          </a>
          {manifest.docs.length > 0 ? (
            <ul className="mt-4 space-y-1 border-t border-neutral-100 pt-3 text-xs text-neutral-500">
              {manifest.docs.map((d) => (
                <li key={d.id}>
                  {d.title}
                  {d.subtitle ? <span className="text-neutral-400"> — {d.subtitle}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}

      <footer className="pb-8 pt-2 text-center text-[10px] text-neutral-400">Shared via Lowpass</footer>
    </Frame>
  );
}

function Frame({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-screen bg-neutral-50 py-8">
      <div className={`mx-auto space-y-4 px-4 ${wide ? 'max-w-4xl' : 'max-w-3xl'}`}>{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-neutral-300 bg-white px-4 py-10 text-center text-sm text-neutral-500">
      {children}
    </p>
  );
}

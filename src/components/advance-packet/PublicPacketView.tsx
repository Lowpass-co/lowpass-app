'use client';

/* ============================================
   LOWPASS — <PublicPacketView> (Sprint 12 §11c)

   Client component for /a/[token]. Mirrors the
   <PublicRiderView> pattern from /r/[token]:

     - POST /api/public/advance-packet/[token] on mount
     - 401 requires_password → password form
     - 401 invalid_password → password form with error
     - 404 → "Link not found"
     - 200 → manifest + Download bundled PDF button

   No per-doc PDF downloads in this view — the bundled PDF
   is the public-share affordance. Per-doc public access
   would need token-gated rider routes, which is a §11
   follow-up.
   ============================================ */

import { useCallback, useEffect, useState } from 'react';
import { Download, FileText, Lock, Package, Sliders } from 'lucide-react';
import type { PacketManifest, PacketDoc } from '@/lib/advance-packet/manifest';

type State =
  | { kind: 'loading' }
  | { kind: 'needs_password'; invalid: boolean }
  | { kind: 'not_found' }
  | { kind: 'error'; message: string }
  | {
      kind: 'ok';
      manifest: PacketManifest;
      tour_id: string;
      routing_id: string | null;
      has_password: boolean;
      password: string | null;
    };

const DOC_ICON: Record<PacketDoc['kind'], typeof FileText> = {
  rider: FileText,
  channel_list: Sliders,
  rental_job: Package,
};

const DOC_KIND_LABEL: Record<PacketDoc['kind'], string> = {
  rider: 'Rider',
  channel_list: 'Channel list',
  rental_job: 'Hire job',
};

export function PublicPacketView({ token }: { token: string }) {
  const [state, setState] = useState<State>({ kind: 'loading' });

  const attempt = useCallback(
    async (password: string | null) => {
      try {
        const res = await fetch(`/api/public/advance-packet/${encodeURIComponent(token)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(password ? { password } : {}),
        });
        if (res.ok) {
          const json = (await res.json()) as {
            manifest: PacketManifest;
            tour_id: string;
            routing_id: string | null;
            has_password: boolean;
          };
          setState({
            kind: 'ok',
            manifest: json.manifest,
            tour_id: json.tour_id,
            routing_id: json.routing_id,
            has_password: json.has_password,
            password,
          });
          return;
        }
        if (res.status === 404) {
          setState({ kind: 'not_found' });
          return;
        }
        if (res.status === 401) {
          const body = await res.json().catch(() => ({}));
          if (body?.requires_password) {
            setState({ kind: 'needs_password', invalid: false });
            return;
          }
          if (body?.invalid_password) {
            setState({ kind: 'needs_password', invalid: true });
            return;
          }
        }
        setState({ kind: 'error', message: `Unexpected status ${res.status}` });
      } catch (e) {
        setState({
          kind: 'error',
          message: e instanceof Error ? e.message : 'Network error',
        });
      }
    },
    [token],
  );

  useEffect(() => {
    const t = window.setTimeout(() => void attempt(null), 0);
    return () => window.clearTimeout(t);
  }, [attempt]);

  if (state.kind === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-neutral-500">
        Loading…
      </div>
    );
  }

  if (state.kind === 'not_found') {
    return (
      <CenteredCard heading="Link not found">
        This link may have been revoked or is incorrect.
      </CenteredCard>
    );
  }

  if (state.kind === 'error') {
    return (
      <CenteredCard heading="Something went wrong">{state.message}</CenteredCard>
    );
  }

  if (state.kind === 'needs_password') {
    return <PasswordForm invalid={state.invalid} onSubmit={(pw) => attempt(pw)} />;
  }

  /* state.kind === 'ok' */
  const { manifest, tour_id: tourId, routing_id: routingId, password } = state;
  const routingLabel = manifest.routing
    ? formatRoutingLabel(manifest.routing)
    : 'All shows';

  /* Build the bundled PDF download URL. If the link is
     password-gated we pass the verified password through the
     same querystring shape the API accepts. Tour-wide packets
     (routing_id null) aren't reachable via the §11a CRUD
     surface — the create-link route requires a routing_id —
     but we defend defensively: hide the download button if
     the link somehow has a null routing_id. */
  const pdfHref = routingId
    ? (() => {
        const base = `/api/advance-packets/${encodeURIComponent(tourId)}/${encodeURIComponent(routingId)}/pdf`;
        const qs = new URLSearchParams({ token });
        if (password) qs.set('pw', password);
        return `${base}?${qs.toString()}`;
      })()
    : null;

  return (
    <div className="min-h-screen bg-neutral-50 py-10">
      <div className="mx-auto max-w-3xl space-y-6 px-4">
        <header className="rounded-xl border border-neutral-200 bg-white p-6">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
            Advance Packet
          </p>
          <h1 className="mt-1 text-2xl font-bold text-neutral-900">
            {manifest.tour.name}
          </h1>
          <p className="text-sm text-neutral-600">{routingLabel}</p>
          {manifest.tour.artist_name && (
            <p className="mt-2 text-xs text-neutral-500">
              For {manifest.tour.artist_name}
            </p>
          )}
          {pdfHref && (
            <a
              href={pdfHref}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[var(--lp-orange)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              <Download className="h-4 w-4" />
              Download bundled PDF
            </a>
          )}
        </header>

        <section className="rounded-xl border border-neutral-200 bg-white">
          <h2 className="border-b border-neutral-200 px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-neutral-500">
            Documents ({manifest.docs.length})
          </h2>
          {manifest.docs.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-neutral-500">
              This packet has no documents yet.
            </p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {manifest.docs.map((doc) => {
                const Icon = DOC_ICON[doc.kind];
                return (
                  <li
                    key={`${doc.kind}-${doc.id}`}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-neutral-400" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-neutral-900">
                        {doc.title}
                      </p>
                      <p className="truncate text-[10px] uppercase tracking-wider text-neutral-500">
                        {DOC_KIND_LABEL[doc.kind]}
                        {doc.subtitle ? ` · ${doc.subtitle}` : ''}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <footer className="text-center text-[10px] text-neutral-400">
          Shared via Lowpass
        </footer>
      </div>
    </div>
  );
}

function PasswordForm({
  invalid,
  onSubmit,
}: {
  invalid: boolean;
  onSubmit: (password: string) => void;
}) {
  const [value, setValue] = useState('');
  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 px-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (value) onSubmit(value);
        }}
        className="w-full max-w-sm space-y-3 rounded-xl border border-neutral-200 bg-white p-6"
      >
        <div className="flex items-center gap-2">
          <Lock className="h-5 w-5 text-neutral-400" />
          <div>
            <div className="text-lg font-semibold text-neutral-900">
              Password required
            </div>
            <div className="text-xs text-neutral-500">
              This packet is protected. Enter the password to view.
            </div>
          </div>
        </div>
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
          className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
          placeholder="Password"
        />
        {invalid && (
          <p className="text-xs text-red-600">Incorrect password. Try again.</p>
        )}
        <button
          type="submit"
          disabled={!value}
          className="w-full rounded-lg bg-[var(--lp-orange)] px-3 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
        >
          Unlock
        </button>
      </form>
    </div>
  );
}

function CenteredCard({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 px-4">
      <div className="max-w-md rounded-xl border border-neutral-200 bg-white p-6 text-center">
        <div className="text-lg font-semibold text-neutral-900">{heading}</div>
        <div className="mt-2 text-sm text-neutral-500">{children}</div>
      </div>
    </div>
  );
}

function formatRoutingLabel(r: NonNullable<PacketManifest['routing']>): string {
  const date = new Date(`${r.date.slice(0, 10)}T12:00:00Z`);
  const dateLabel = Number.isNaN(date.getTime())
    ? r.date
    : date.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
  const where = [r.venue, r.city].filter(Boolean).join(', ');
  return where ? `${dateLabel} — ${where}` : dateLabel;
}

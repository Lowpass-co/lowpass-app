/* ============================================
   LOWPASS — Site Admins management card (Settings)

   Lists current site admins and lets existing admins promote new
   users by email or revoke admin from an existing one. Backed by:
     GET    /api/admins            → list
     POST   /api/admins            → promote by email
     DELETE /api/admins/:id        → demote

   Server functions enforce: admin-only, no self-demotion, no
   last-admin demotion. This component surfaces those errors inline.

   Styled to match the bug reports design language (surface card,
   orange accents, compact row list).
   ============================================ */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Loader2, ShieldCheck, Trash2, UserPlus, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type Admin = {
  id: string;
  email: string | null;
  name: string | null;
  avatar_url: string | null;
  created_at: string;
};

function initialsFor(admin: Admin): string {
  const source = admin.name?.trim() || admin.email || '';
  if (!source) return '?';
  const parts = source.split(/\s+|@/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || source[0]!.toUpperCase();
}

export function SiteAdminsCard({ currentUserId }: { currentUserId: string }) {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [promoting, setPromoting] = useState(false);
  const [promoteError, setPromoteError] = useState<string | null>(null);
  const [promoteSuccess, setPromoteSuccess] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  const [pendingDemoteId, setPendingDemoteId] = useState<string | null>(null);
  const [demoting, setDemoting] = useState<string | null>(null);
  const [demoteError, setDemoteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/admins', { cache: 'no-store' });
      const json = (await res.json().catch(() => null)) as { admins?: Admin[]; error?: string } | null;
      if (!res.ok) {
        throw new Error(json?.error ?? 'Could not load admins');
      }
      setAdmins(json?.admins ?? []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load admins');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const lastAdmin = admins.length <= 1;

  const handlePromote = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = email.trim();
    if (!value) {
      setPromoteError('Enter an email address');
      return;
    }
    setPromoting(true);
    setPromoteError(null);
    setPromoteSuccess(null);
    try {
      const res = await fetch('/api/admins', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: value }),
      });
      const json = (await res.json().catch(() => null)) as
        | { admin?: { email: string | null; name: string | null }; error?: string }
        | null;
      if (!res.ok) {
        throw new Error(json?.error ?? 'Could not promote user');
      }
      setEmail('');
      setPromoteSuccess(
        `Promoted ${json?.admin?.name || json?.admin?.email || value} to site admin.`
      );
      await load();
      emailRef.current?.focus();
    } catch (err) {
      setPromoteError(err instanceof Error ? err.message : 'Could not promote user');
    } finally {
      setPromoting(false);
    }
  };

  const handleDemote = async (admin: Admin) => {
    setDemoting(admin.id);
    setDemoteError(null);
    try {
      const res = await fetch(`/api/admins/${admin.id}`, { method: 'DELETE' });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        throw new Error(json?.error ?? 'Could not demote admin');
      }
      setPendingDemoteId(null);
      await load();
    } catch (err) {
      setDemoteError(err instanceof Error ? err.message : 'Could not demote admin');
    } finally {
      setDemoting(null);
    }
  };

  const sortedAdmins = useMemo(
    () =>
      [...admins].sort((a, b) => {
        const an = (a.name || a.email || '').toLowerCase();
        const bn = (b.name || b.email || '').toLowerCase();
        return an.localeCompare(bn);
      }),
    [admins]
  );

  return (
    <section className="rounded-xl border border-lp-border bg-lp-surface p-6 shadow-sm">
      <header className="flex items-start justify-between gap-3 border-b border-lp-border pb-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-lp-orange/10 text-lp-orange">
            <ShieldCheck size={18} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-lp-text">Site admins</h2>
            <p className="mt-0.5 text-sm text-lp-text-secondary">
              Admins can triage bug reports, manage other admins, and access
              cross-workspace tools. Everyone else sees the normal app.
            </p>
          </div>
        </div>
      </header>

      <form
        onSubmit={handlePromote}
        className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-start"
      >
        <div className="flex-1">
          <label className="sr-only" htmlFor="admin-promote-email">
            Email
          </label>
          <input
            id="admin-promote-email"
            ref={emailRef}
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (promoteError) setPromoteError(null);
              if (promoteSuccess) setPromoteSuccess(null);
            }}
            placeholder="user@example.com"
            autoComplete="off"
            disabled={promoting}
            className="w-full rounded-xl border border-lp-border bg-lp-surface px-3 py-2.5 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none focus:ring-2 focus:ring-lp-orange/20 disabled:opacity-50"
          />
        </div>
        <button
          type="submit"
          disabled={promoting || email.trim() === ''}
          className="btn-transition inline-flex items-center justify-center gap-2 rounded-xl bg-lp-orange px-4 py-2.5 text-sm font-medium text-white hover:bg-lp-orange/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {promoting ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
          {promoting ? 'Promoting…' : 'Promote'}
        </button>
      </form>
      {promoteError && (
        <p className="mt-2 text-sm text-red-500">{promoteError}</p>
      )}
      {promoteSuccess && (
        <p className="mt-2 text-sm text-emerald-500">{promoteSuccess}</p>
      )}
      <p className="mt-2 text-xs text-lp-text-tertiary">
        The email must belong to an existing Lowpass account. Ask them to sign up first.
      </p>

      <div className="mt-6">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-lp-text-secondary">
            <Loader2 size={14} className="animate-spin" />
            Loading admins…
          </div>
        ) : loadError ? (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-500">
            <span>{loadError}</span>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded px-2 py-1 text-xs font-medium hover:bg-red-500/10"
            >
              Retry
            </button>
          </div>
        ) : sortedAdmins.length === 0 ? (
          <p className="text-sm text-lp-text-secondary">No site admins yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-lp-border/60 rounded-xl border border-lp-border">
            {sortedAdmins.map((admin) => {
              const isSelf = admin.id === currentUserId;
              const isPendingThis = pendingDemoteId === admin.id;
              const isDemotingThis = demoting === admin.id;
              return (
                <li
                  key={admin.id}
                  className="flex items-center gap-3 px-3 py-2.5"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-lp-border bg-lp-bg-secondary text-xs font-semibold text-lp-text">
                    {admin.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={admin.avatar_url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span>{initialsFor(admin)}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-lp-text">
                        {admin.name || admin.email || 'Unnamed'}
                      </span>
                      {isSelf && (
                        <span className="rounded-full border border-lp-orange/40 bg-lp-orange/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-lp-orange">
                          You
                        </span>
                      )}
                    </div>
                    {admin.email && admin.name && (
                      <div className="truncate text-xs text-lp-text-tertiary">
                        {admin.email}
                      </div>
                    )}
                  </div>

                  {isPendingThis ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={isDemotingThis}
                        onClick={() => void handleDemote(admin)}
                        className="btn-transition inline-flex items-center gap-1 rounded-lg border border-red-500/40 bg-red-500/10 px-2.5 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-500/20 disabled:opacity-60"
                        title="Confirm remove admin"
                      >
                        {isDemotingThis ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Check size={12} />
                        )}
                        Confirm
                      </button>
                      <button
                        type="button"
                        disabled={isDemotingThis}
                        onClick={() => setPendingDemoteId(null)}
                        className="btn-transition inline-flex items-center gap-1 rounded-lg border border-lp-border px-2.5 py-1.5 text-xs font-medium text-lp-text-secondary hover:bg-lp-surface-hover"
                        title="Cancel"
                      >
                        <X size={12} />
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={isSelf || lastAdmin}
                      onClick={() => {
                        setPendingDemoteId(admin.id);
                        setDemoteError(null);
                      }}
                      className={cn(
                        'btn-transition inline-flex items-center gap-1 rounded-lg border border-lp-border px-2.5 py-1.5 text-xs font-medium text-lp-text-secondary hover:bg-lp-surface-hover disabled:cursor-not-allowed disabled:opacity-40',
                      )}
                      title={
                        isSelf
                          ? 'You cannot demote yourself'
                          : lastAdmin
                            ? 'At least one site admin is required'
                            : 'Remove admin'
                      }
                    >
                      <Trash2 size={12} />
                      Remove
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {demoteError && (
          <p className="mt-2 text-sm text-red-500">{demoteError}</p>
        )}
      </div>
    </section>
  );
}

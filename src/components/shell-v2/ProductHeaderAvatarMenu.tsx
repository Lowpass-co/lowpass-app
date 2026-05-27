/* ============================================
   LOWPASS — Product Split Phase 2 §F1.2 — Avatar dropdown

   Phase 1 shipped a static placeholder avatar inside <ProductHeader>;
   Adam's smoke flagged that clicking did nothing. This component
   makes the avatar interactive: click toggles the dropdown, click
   outside / Escape closes it, all the Foundation entries surface.

   Mounted from <ProductHeader> (server) which fetches user + admin
   status and hands it down. Sign-out is a server action triggered
   from the client.
   ============================================ */

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  Building2,
  Bug,
  LogOut,
  Settings,
  SunMoon,
  Users,
} from 'lucide-react';
import { AccountAvatar } from '@/components/shell/AccountAvatar';
import { DarkModeToggle } from '@/components/layout/DarkModeToggle';
import { createClient as createBrowserSupabase } from '@/lib/supabase-client';
import { toTitleCase } from '@/lib/text/toTitleCase';

interface ProductHeaderAvatarMenuProps {
  user: { name: string; email: string; avatarUrl?: string | null };
  isSiteAdmin: boolean;
}

export function ProductHeaderAvatarMenu({
  user,
  isSiteAdmin,
}: ProductHeaderAvatarMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const close = () => setOpen(false);

  const handleSignOut = async () => {
    setOpen(false);
    try {
      const supabase = createBrowserSupabase();
      await supabase.auth.signOut();
    } catch {
      // Supabase signOut throws on network failure; the redirect below
      // still pushes the user out of the authenticated app.
    }
    router.replace('/login');
    router.refresh();
  };

  /* Sprint 9 §14.13 — match the TopBar (shell-v1) user pill so
     shell-v2 chrome (Operations / Budget / Advance) carries
     the same avatar + name + ADMIN badge treatment. ADMIN is
     a sibling element on the left of the trigger (matches
     §13.A.3's TopBar layout); the trigger itself is now a
     wider rounded-md pill that shows the display name. Falls
     back to the email local-part when no display name is set
     so the pill never reads as empty. */
  /* Sprint 9 §14.1 — title-case the display label so workspace
     names stored as "adam's workspace" or names entered without
     capitalisation render as "Adam's Workspace" / "Adam Growley".
     Email local-parts get the same treatment when used as
     fallback. */
  const displayLabel = toTitleCase(
    user.name?.trim() || user.email.split('@')[0] || 'Account',
  );

  return (
    <div className="flex items-center" style={{ gap: 'var(--lp-space-2)' }}>
      {isSiteAdmin ? (
        <span
          className="lp-label-caps"
          title="You have site admin access — visible across all workspaces"
          style={{
            flexShrink: 0,
            padding: '2px 8px',
            fontSize: 'var(--lp-text-2xs)',
            fontWeight: 'var(--lp-weight-semibold)',
            color: 'var(--lp-text)',
            background: 'var(--lp-bg-tertiary)',
            border: '1px solid var(--lp-border-subtle)',
            borderRadius: 999,
          }}
        >
          Admin
        </span>
      ) : null}
      <div className="relative" ref={wrapperRef}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="btn-transition flex max-w-[200px] min-w-0 items-center gap-2 rounded-md border px-2 py-1.5"
          style={{
            borderColor: 'var(--lp-border)',
            color: 'var(--lp-text)',
            background: 'transparent',
          }}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Account menu"
        >
          <AccountAvatar user={user} size={28} />
          <span
            className="truncate"
            style={{
              fontSize: 'var(--lp-text-sm)',
              fontWeight: 'var(--lp-weight-medium)',
            }}
          >
            {displayLabel}
          </span>
        </button>
      {open ? (
        <div
          className="absolute right-0 mt-1 w-60 rounded-xl border py-1 shadow-lg"
          style={{
            zIndex: 'var(--lp-z-dropdown)',
            background: 'var(--lp-surface)',
            borderColor: 'var(--lp-border-strong)',
          }}
          role="menu"
        >
          {/* Header — name + email */}
          <div
            className="px-3 py-2"
            style={{
              borderBottom: '1px solid var(--lp-border)',
            }}
          >
            <div
              className="truncate"
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--lp-text)',
              }}
            >
              {user.name || user.email.split('@')[0]}
            </div>
            <div
              className="truncate"
              style={{
                fontSize: '11px',
                color: 'var(--lp-text-tertiary)',
              }}
            >
              {user.email}
            </div>
          </div>

          {/* IA Cleanup §I3 — Personnel entry retired here.
              Personnel is now a workspace dashboard tab
              (/personnel under the (workspace) route group),
              reachable from /artists. Keeping it in the avatar
              dropdown too would create duplicate-entry-point
              confusion.
              §I1.2 — Templates entry already removed; the
              /templates route doesn't exist. */}
          <MenuLink
            href="/venues"
            label="Venues"
            Icon={Building2}
            onClose={close}
          />
          {/* IA Cleanup §I4 — Rental entry retired.
              /account/rental is a permanent redirect to
              /equipment, which is now a workspace dashboard
              tab. Keeping the entry would duplicate the
              tab nav. */}

          <div
            className="my-1"
            style={{ borderTop: '1px solid var(--lp-border)' }}
          />

          <MenuLink
            href="/settings"
            label="Settings"
            Icon={Settings}
            onClose={close}
          />
          {isSiteAdmin ? (
            <MenuLink
              href="/bugs"
              label="Bug reports"
              Icon={Bug}
              onClose={close}
            />
          ) : null}

          {/* Theme toggle */}
          <div
            className="flex items-center justify-between px-3 py-1.5"
            style={{ fontSize: '14px', color: 'var(--lp-text)' }}
          >
            <span className="inline-flex items-center gap-2">
              <SunMoon
                className="h-4 w-4"
                style={{ color: 'var(--lp-text-tertiary)' }}
              />
              Theme
            </span>
            <DarkModeToggle />
          </div>

          <div
            className="my-1"
            style={{ borderTop: '1px solid var(--lp-border)' }}
          />

          <button
            type="button"
            onClick={handleSignOut}
            className="w-full px-3 py-2 text-left"
            style={{ fontSize: '14px', color: 'var(--lp-text)' }}
            role="menuitem"
          >
            <span className="inline-flex items-center gap-2">
              <LogOut
                className="h-4 w-4"
                style={{ color: 'var(--lp-text-tertiary)' }}
              />
              Sign out
            </span>
          </button>
        </div>
      ) : null}
      </div>
    </div>
  );
}

function MenuLink({
  href,
  label,
  Icon,
  onClose,
}: {
  href: string;
  label: string;
  Icon: typeof Users;
  onClose: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClose}
      className="block px-3 py-2"
      style={{ fontSize: '14px', color: 'var(--lp-text)' }}
      role="menuitem"
    >
      <span className="inline-flex items-center gap-2">
        <Icon className="h-4 w-4" style={{ color: 'var(--lp-text-tertiary)' }} />
        {label}
      </span>
    </Link>
  );
}

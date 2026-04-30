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
  LayoutGrid,
  LogOut,
  Package,
  Settings,
  SunMoon,
  Users,
} from 'lucide-react';
import { AccountAvatar } from '@/components/shell/AccountAvatar';
import { DarkModeToggle } from '@/components/layout/DarkModeToggle';
import { createClient as createBrowserSupabase } from '@/lib/supabase-client';

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

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="btn-transition flex items-center justify-center overflow-hidden rounded-full border"
        style={{
          height: 32,
          width: 32,
          borderColor: 'var(--lp-border-strong)',
          background: 'transparent',
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
      >
        <AccountAvatar user={user} size={28} />
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

          {/* Foundation entries (Phase 1 §D decisions) */}
          <MenuLink
            href="/personnel"
            label="Personnel directory"
            Icon={Users}
            onClose={close}
          />
          <MenuLink
            href="/templates"
            label="Templates"
            Icon={LayoutGrid}
            onClose={close}
          />
          <MenuLink
            href="/venues"
            label="Venues"
            Icon={Building2}
            onClose={close}
          />
          <MenuLink
            href="/account/rental"
            label="Rental"
            Icon={Package}
            onClose={close}
          />

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

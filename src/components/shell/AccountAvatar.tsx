'use client';

/* ============================================
   LOWPASS — AccountAvatar

   Renders the user's avatar with a graceful fallback. Used in TopBar's
   account chip. Replaces the previous broken-image [?] surface that
   appeared when avatarUrl was unset OR the image failed to load.

   Behaviour:
   - If user.avatarUrl is set AND the image loads → renders next/image.
   - Otherwise → orange initials chip (white-on-orange, brand-consistent).

   Initials derivation: first + last word of name, falling back to the
   first two characters of email if name is unavailable.
   ============================================ */

import Image from 'next/image';
import { useState } from 'react';

export function deriveInitials(nameOrEmail: string | null | undefined): string {
  const trimmed = (nameOrEmail ?? '').trim();
  if (!trimmed) return '?';
  // Email-like: take the part before "@" and pull two letters from it.
  if (trimmed.includes('@')) {
    const local = trimmed.split('@')[0]?.replace(/[^a-zA-Z0-9]/g, '') ?? '';
    if (local.length >= 2) return local.slice(0, 2).toUpperCase();
    if (local.length === 1) return local.toUpperCase();
    return '?';
  }
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return '?';
  if (tokens.length === 1) return tokens[0].slice(0, 2).toUpperCase();
  return (tokens[0][0] + tokens[tokens.length - 1][0]).toUpperCase();
}

export type AccountAvatarProps = {
  user: { name: string; email: string; avatarUrl?: string | null };
  /** Pixel size of the avatar (square). Default 28. */
  size?: number;
};

/**
 * Inner component keyed by avatarUrl in the parent. Whenever the URL
 * changes, React unmounts and remounts this — the failure flag resets
 * for free, no useEffect required.
 */
function AvatarInner({
  avatarUrl,
  initials,
  labelSource,
  size,
}: {
  avatarUrl: string | null | undefined;
  initials: string;
  labelSource: string;
  size: number;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = !!avatarUrl && !imageFailed;

  if (showImage) {
    return (
      <Image
        src={avatarUrl as string}
        alt=""
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
        onError={() => setImageFailed(true)}
      />
    );
  }

  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-semibold"
      style={{
        width: size,
        height: size,
        background: 'var(--color-lp-orange)',
        color: 'var(--lp-text-inverse, #FFFFFF)',
        // Token catalogue uses --lp-text-2xs for very small labels; fall back
        // to a literal so this works on the older globals.css.
        fontSize: size <= 24 ? 'var(--lp-text-2xs, 10px)' : 'var(--lp-text-xs, 11px)',
      }}
      aria-label={labelSource || 'Account'}
    >
      {initials}
    </span>
  );
}

export function AccountAvatar({ user, size = 28 }: AccountAvatarProps) {
  const labelSource = user.name || user.email || '';
  const initials = deriveInitials(labelSource);
  // Key on avatarUrl so a URL change unmounts the inner component and
  // resets its `imageFailed` state without a useEffect (which would trip
  // the project's react-hooks/set-state-in-effect rule).
  return (
    <AvatarInner
      key={user.avatarUrl ?? '__no_avatar__'}
      avatarUrl={user.avatarUrl}
      initials={initials}
      labelSource={labelSource}
      size={size}
    />
  );
}

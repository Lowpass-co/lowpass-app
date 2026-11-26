/* ============================================
   LOWPASS — /r/<token> — the live rider a promoter opens (rebuild, Nov 2026)

   One show's rider (or the whole tour's): always the latest PUBLISHED
   version, filtered to that show's date, with its number and date, what
   changed, the stamped PDF, an "I've read it" acknowledgement and a reply
   on any request line. The token is the grant (service role after the
   token check — server/riders/public.ts). Viewing records "read vX.Y".

   The same prefix still serves the OLD builder's share links
   (rider_web_links): a channel-list document keeps its old reader
   (PackEditor still shares channel lists that way); an old RIDER link
   forwards to the tour's whole-tour link when there is one and the old
   link had no password, else says the rider moved. Nothing is written.
   ============================================ */

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceSupabaseClient } from '@/lib/supabase-server';
import { loadPublicRider, oldPackLink, tourWideToken, TOKEN_RE } from '@/server/riders/public';
import { PublicRiderView } from '@/components/rider-pack/PublicRiderView';
import { RiderPublic } from '@/components/riders/RiderPublic';
import '@/components/riders/riderPublic.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Rider', robots: { index: false, follow: false } };

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="rdp-page">
      <div className="rdp-notice">
        <h1>{title}</h1>
        <p>{children}</p>
      </div>
    </main>
  );
}

export default async function PublicRiderPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  /** ?print=1 — the old channel-list reader's print layout. */
  searchParams: Promise<{ print?: string }>;
}) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const service = createServiceSupabaseClient() as unknown as SupabaseClient;
  const data = TOKEN_RE.test(token) ? await loadPublicRider(service, token, { recordView: true }) : null;
  if (data) {
    if (!data.snapshot || !data.versions.length) {
      return (
        <Notice title={`${data.artist ? `${data.artist} — ` : ''}rider`}>
          The rider for this show hasn’t been published yet. This link will show it as soon as it is.
        </Notice>
      );
    }
    return <RiderPublic data={data} token={token} />;
  }

  const old = await oldPackLink(service, token);
  if (old && old.kind !== 'rider') return <PublicRiderView token={token} printMode={sp.print === '1'} />;
  if (old) {
    const forward = old.tourId && !old.hadPassword ? await tourWideToken(service, old.tourId) : null;
    if (forward) redirect(`/r/${forward}`);
    return (
      <Notice title="This rider has moved">
        The tour now keeps its rider on a new page with version history. Ask the tour manager for the current link.
      </Notice>
    );
  }
  return <Notice title="This link isn’t active">It may have been replaced with a new one. Ask the tour manager for the current link.</Notice>;
}

/* ============================================
   LOWPASS — Public intake-reminder opt-out (P7 · Checkpoint E)

   GET /api/public/intake-reminders/[token]/opt-out

   The per-link opt-out target linked in every venue reminder email.
   Token-gated, unauthenticated, service-role. Opt-out is modelled
   WITHOUT a schema change: we DELETE the link's remaining UNSENT
   reminder rows (sent_at IS NULL). Already-sent rows are untouched
   (audit), and no future venue reminder can fire for this link.
   The tm_completed row is left alone — opting out of reminders
   shouldn't suppress the TM's completion note.

   Returns a tiny plain-text HTML confirmation (no app chrome — the
   recipient is an unauthenticated venue). Idempotent: a second click
   simply deletes nothing.
   ============================================ */

import { createServiceSupabaseClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

function page(title: string, body: string): Response {
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><body style="font-family:system-ui,-apple-system,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1.5rem;line-height:1.5;color:#1a1a1a"><h1 style="font-size:1.25rem">${title}</h1><p>${body}</p></body>`;
  return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;
  if (!token) return page('Link not found', 'This opt-out link is invalid.');

  const service = createServiceSupabaseClient();
  const { data: link } = await service
    .from('advance_intake_links')
    .select('id')
    .eq('token', token)
    .maybeSingle<{ id: string }>();

  if (!link) return page('Link not found', 'This opt-out link is invalid or has expired.');

  // Remove only the still-unsent venue reminders for this link.
  await service
    .from('intake_reminders')
    .delete()
    .eq('link_id', link.id)
    .is('sent_at', null)
    .in('kind', ['t14', 't7', 't3']);

  return page(
    "You're unsubscribed",
    "You won't receive any more advance reminder emails for this show. You can still open your intake link and complete it any time.",
  );
}

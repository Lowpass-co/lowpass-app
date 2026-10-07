/* ============================================
   LOWPASS — refresh the budget after a source route succeeds

   Wraps a route handler whose writes feed the budget's automatic lines
   (roster changes, routing day types). The tour is resolved BEFORE the
   handler runs — a DELETE can't be traced back to its tour afterwards — and
   the refresh runs only when the handler returned 2xx. It never changes the
   handler's response and never throws.
   ============================================ */

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { logServerError } from '@/lib/log/serverError';
import { FAMILIES_FOR_SOURCE, refreshDerivedLines } from '@/server/budget/reconcileDerivedLines';

type Ctx = { params: Promise<Record<string, string>> };
type Handler<C extends Ctx> = (request: Request, ctx: C) => Promise<Response>;
type Supabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

export function withDerivedRefresh<C extends Ctx>(
  handler: Handler<C>,
  source: keyof typeof FAMILIES_FOR_SOURCE,
  resolveTourId: (supabase: Supabase, params: Record<string, string>) => Promise<string | null | undefined>,
): Handler<C> {
  return async (request, ctx) => {
    let tourId: string | null | undefined = null;
    let supabase: Supabase | null = null;
    try {
      supabase = await createServerSupabaseClient();
      tourId = await resolveTourId(supabase, await ctx.params);
    } catch (e) {
      logServerError('withDerivedRefresh: resolve tour', e);
    }

    const res = await handler(request, ctx);

    if (res.ok && tourId && supabase) {
      const { data: tour } = await supabase.from('tours').select('workspace_id').eq('id', tourId).maybeSingle();
      await refreshDerivedLines(supabase, tourId, (tour as { workspace_id?: string } | null)?.workspace_id, source);
    }
    return res;
  };
}

/** For routes nested under /tours/[id]/… */
export const tourFromParams = async (_s: Supabase, p: Record<string, string>) => p.id;

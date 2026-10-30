/* POST /api/tours/[id]/advance/[routingId]/export/sheet/pdf — read-only; see
   src/server/advance/exportRoutes.ts. Body: { config? }. */

import { advanceExportPdf } from '@/server/advance/exportRoutes';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export function POST(request: Request, ctx: { params: Promise<{ id: string; routingId: string }> }) {
  return advanceExportPdf(request, ctx, 'sheet');
}

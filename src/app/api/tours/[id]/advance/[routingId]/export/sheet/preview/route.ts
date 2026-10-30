/* POST /api/tours/[id]/advance/[routingId]/export/sheet/preview — read-only; see
   src/server/advance/exportRoutes.ts. Body: { config? }. */

import { advanceExportPreview } from '@/server/advance/exportRoutes';

export const dynamic = 'force-dynamic';

export function POST(request: Request, ctx: { params: Promise<{ id: string; routingId: string }> }) {
  return advanceExportPreview(request, ctx, 'sheet');
}

/* ============================================
   LOWPASS — GET /api/advance-packets/[tourId]/[routingId]/pdf
   (Sprint 12 §10 stub — finished in §11)

   Bundles every rider in a tour's advance into a single PDF.

   §10 ships the SINGLE-rider PDF endpoint
   (/api/rider-packs/[id]/pdf). The bundle workflow needs the
   advance-packet view + public reader (/a/[token]) to land
   first — that's §11. Until then this route returns 501 so
   anyone wiring the UI early gets a clear pointer.

   When §11 ships, this endpoint will:
     1. Look up the routing + its child rider packs.
     2. Render each one via the single-rider pipeline.
     3. Stitch the buffers together with pdf-lib + add a
        table-of-contents page that anchors to each rider's
        first page.
   ============================================ */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    {
      error:
        'Bundled advance-packet PDFs are not yet available. This endpoint ships in Sprint 12 §11 alongside the advance-packet view.',
    },
    { status: 501 },
  );
}

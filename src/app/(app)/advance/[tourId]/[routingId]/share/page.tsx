/* Advance · Share surface (P3 · B1 skeleton).
   B1 maps Share onto the existing packet surface; B4 builds the venue-view /
   intake-link / packet-builder Share page here. */
import { redirect } from 'next/navigation';

export default async function AdvanceSharePage({
  params,
}: {
  params: Promise<{ tourId: string; routingId: string }>;
}) {
  const { tourId, routingId } = await params;
  redirect(`/advance/${tourId}/${routingId}/packet`);
}

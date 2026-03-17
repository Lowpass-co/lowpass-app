import { redirect } from 'next/navigation';

export default async function TourWidePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/budget?tour_id=${id}`);
}

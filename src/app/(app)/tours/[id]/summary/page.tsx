import { redirect } from 'next/navigation';

/** Legacy path: same destination as sidebar “Tour Summary” (overview + cards + day view). */
export default async function SummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/tours/${id}/overview`);
}

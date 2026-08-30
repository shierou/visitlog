import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import VisitForm from '@/components/VisitForm';

export const dynamic = 'force-dynamic';

export default async function VisitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const place = await db.place.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!place) notFound();
  return <VisitForm placeId={place.id} placeName={place.name} />;
}

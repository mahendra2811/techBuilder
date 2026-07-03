import { SiteDetailScreen } from '@/components/screens/site-detail-screen';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SiteDetailScreen siteId={id} />;
}

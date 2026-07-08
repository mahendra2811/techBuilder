import { DriverDetailScreen } from '@/components/screens/driver-detail-screen';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DriverDetailScreen driverUserId={id} backHref="/site-manager/fleet" />;
}

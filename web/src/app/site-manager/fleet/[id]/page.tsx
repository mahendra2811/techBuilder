import { VehicleDetailScreen } from '@/components/screens/vehicle-detail-screen';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <VehicleDetailScreen vehicleId={id} backHref="/site-manager/fleet" />;
}

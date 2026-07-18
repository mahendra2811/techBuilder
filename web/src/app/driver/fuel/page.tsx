import { DriverFuelScreen } from '@/components/screens/driver-fuel-screen';

// Auth + role pinning + shell come from the parent driver/layout.tsx.
// DRV-2 (docs/role-page-map/driver/driver-role-updates.md, frozen.10): "today's
// fuel update" — split out of the old combined /driver/vehicle page.
export default function Page() {
  return <DriverFuelScreen />;
}

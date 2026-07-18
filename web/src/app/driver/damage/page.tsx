import { DriverDamageScreen } from '@/components/screens/driver-damage-screen';

// Auth + role pinning + shell come from the parent driver/layout.tsx.
// DRV-2/DRV-3 (docs/role-page-map/driver/driver-role-updates.md, frozen.10): damage
// form + his damage history — split out of the old combined /driver/vehicle page.
export default function Page() {
  return <DriverDamageScreen />;
}

import { VehicleSwitchScreen } from '@/components/screens/vehicle-switch-screen';

// Auth + role pinning + shell come from the parent driver/layout.tsx.
// DRV-2 (docs/role-page-map/driver/driver-role-updates.md, frozen.10): this page now
// hosts vehicle-switch ONLY — fuel moved to /driver/fuel, damage moved to /driver/damage.
export default function Page() {
  return <VehicleSwitchScreen />;
}

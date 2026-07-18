import { VehicleSwitchScreen } from '@/components/screens/vehicle-switch-screen';
import { RequestsScreen } from '@/components/screens/requests-screen';

// Auth + role pinning + shell come from the parent driver/layout.tsx.
// DRV-2 (docs/role-page-map/driver/driver-role-updates.md, frozen.10): this page now
// stacks vehicle-switch + the vehicle-change (VEHICLE_SWITCH) request form/history —
// fuel lives at /driver/fuel, damage at /driver/damage, expense requests at
// /driver/expense (nav restructure — see driver/expense/page.tsx + lib/nav.ts).
export default function Page() {
  return (
    <div className="grid gap-4">
      <VehicleSwitchScreen />
      <RequestsScreen role="DRIVER" />
    </div>
  );
}

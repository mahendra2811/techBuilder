import { FuelScreen } from '@/components/screens/fuel-screen';
import { VehicleSwitchScreen } from '@/components/screens/vehicle-switch-screen';

// Auth + role pinning + shell come from the parent driver/layout.tsx.
// Stacked: WO-11 self-switch + damage report/history, then the existing fuel entry
// screen (WO-0) — the most discoverable "my vehicle" surface a driver already visits daily.
export default function Page() {
  return (
    <div className="grid gap-4">
      <VehicleSwitchScreen />
      <FuelScreen />
    </div>
  );
}

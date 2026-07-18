import { DriverMeterScreen } from '@/components/screens/driver-meter-screen';

// Auth + role pinning + shell come from the parent driver/layout.tsx.
// DRV-1/DRV-5 (docs/role-page-map/driver/driver-role-updates.md, frozen.10):
// dedicated page for the Start-of-day / End-of-day forms, split out of the
// dashboard's inline forms — the dashboard's day-log chips link here.
export default function Page() {
  return <DriverMeterScreen />;
}

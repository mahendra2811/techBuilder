import { SupervisorCrewVehiclesCard } from '@/components/dashboard/supervisor-crew-vehicles-card';

// Auth + role pinning + shell come from the parent supervisor/layout.tsx.
// SUPERVISOR restructure: crew vehicles + re-allot, moved off the dashboard onto its
// own page — mirrors the driver's dedicated /driver/vehicle page.
export default function Page() {
  return <SupervisorCrewVehiclesCard />;
}

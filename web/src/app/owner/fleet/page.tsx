import { FleetScreen } from '@/components/screens/fleet-screen';

// Auth + role pinning + shell come from the parent owner/layout.tsx.
export default function Page() {
  return <FleetScreen role="OWNER" />;
}

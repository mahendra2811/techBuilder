import { FleetScreen } from '@/components/screens/fleet-screen';

// Auth + role pinning + shell come from the parent site-manager/layout.tsx.
// GET /vehicles + /sites return only the SM's own site(s) — the add-vehicle
// form's site picker is therefore already scoped, and required (not optional
// like it is for the Owner).
export default function Page() {
  return <FleetScreen role="SITE_MANAGER" />;
}

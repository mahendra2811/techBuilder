import { OwnerDashboardScreen } from '@/components/screens/owner-dashboard-screen';

// Auth + role pinning + shell come from the parent site-manager/layout.tsx.
// The backend auto-scopes /dashboards/owner (and every list) to the SM's sites.
export default function Page() {
  return <OwnerDashboardScreen variant="SITE_MANAGER" />;
}

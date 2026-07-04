import { FuelScreen } from '@/components/screens/fuel-screen';

// Auth + role pinning + shell come from the parent site-manager/layout.tsx.
// GET /vehicles returns the SM's site fleet — more than one vehicle renders
// the screen's built-in selector. role widens backdating to the SM window.
export default function Page() {
  return <FuelScreen role="SITE_MANAGER" />;
}

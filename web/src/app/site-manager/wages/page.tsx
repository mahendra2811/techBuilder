import { WagesScreen } from '@/components/screens/wages-screen';

// Auth + role pinning + shell come from the parent site-manager/layout.tsx.
// GET /reports/wage-summary auto-scopes to the SM's site(s); the "set a wage
// rate" form is hidden here (config.manage is Owner-only).
export default function Page() {
  return <WagesScreen role="SITE_MANAGER" />;
}

import { InsightsScreen } from '@/components/screens/insights-screen';

// Auth + role pinning + shell come from the parent site-manager/layout.tsx.
export default function Page() {
  return <InsightsScreen role="SITE_MANAGER" />;
}

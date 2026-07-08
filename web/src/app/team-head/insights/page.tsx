import { InsightsScreen } from '@/components/screens/insights-screen';

// Auth + role pinning + shell come from the parent team-head/layout.tsx.
export default function Page() {
  return <InsightsScreen role="TEAM_HEAD" />;
}

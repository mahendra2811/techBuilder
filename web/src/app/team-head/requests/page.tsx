import { RequestsScreen } from '@/components/screens/requests-screen';

// Auth + role pinning + shell come from the parent team-head/layout.tsx.
export default function Page() {
  return <RequestsScreen role="TEAM_HEAD" />;
}

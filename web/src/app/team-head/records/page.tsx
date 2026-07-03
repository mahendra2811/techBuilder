import { RecordsScreen } from '@/components/screens/records-screen';

// Auth + role pinning + shell come from the parent team-head/layout.tsx.
export default function Page() {
  return <RecordsScreen role="TEAM_HEAD" />;
}

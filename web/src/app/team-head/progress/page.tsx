import { ProgressScreen } from '@/components/screens/progress-screen';

// Auth + role pinning + shell come from the parent team-head/layout.tsx.
export default function Page() {
  return <ProgressScreen role="TEAM_HEAD" />;
}

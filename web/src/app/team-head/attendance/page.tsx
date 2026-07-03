import { AttendanceScreen } from '@/components/screens/attendance-screen';

// Auth + role pinning + shell come from the parent team-head/layout.tsx.
export default function Page() {
  return <AttendanceScreen role="TEAM_HEAD" />;
}

import { AttendanceScreen } from '@/components/screens/attendance-screen';

// Auth + role pinning + shell come from the parent site-manager/layout.tsx.
export default function Page() {
  return <AttendanceScreen role="SITE_MANAGER" />;
}

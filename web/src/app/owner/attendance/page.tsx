import { AttendanceScreen } from '@/components/screens/attendance-screen';

// Auth + role pinning + shell come from the parent owner/layout.tsx.
// GET /sites returns ALL sites for the owner (site picker), and the owner has
// no backdating cap (minEntryDate → undefined).
export default function Page() {
  return <AttendanceScreen role="OWNER" />;
}

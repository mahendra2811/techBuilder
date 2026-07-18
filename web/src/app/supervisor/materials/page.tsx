import { MaterialEntryScreen } from '@/components/screens/material-entry-screen';

// Auth + role pinning + shell come from the parent supervisor/layout.tsx.
export default function Page() {
  return <MaterialEntryScreen role="SUPERVISOR" />;
}

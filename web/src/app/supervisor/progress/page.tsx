import { ProgressScreen } from '@/components/screens/progress-screen';

// Auth + role pinning + shell come from the parent supervisor/layout.tsx.
export default function Page() {
  return <ProgressScreen role="SUPERVISOR" />;
}

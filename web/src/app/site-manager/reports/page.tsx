import { ReportsScreen } from '@/components/screens/reports-screen';

// Auth + role pinning + shell come from the parent site-manager/layout.tsx.
// Same screen as /owner/reports — every query it makes (sites, people, users,
// expenses, per-site attendance) is scoped server-side to the SM's sites.
export default function Page() {
  return <ReportsScreen />;
}

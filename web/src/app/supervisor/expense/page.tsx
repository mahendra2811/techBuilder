import { ExpenseRequestScreen } from '@/components/screens/expense-request-screen';

// Auth + role pinning + shell come from the parent supervisor/layout.tsx.
// SUPERVISOR restructure: replaces the old direct-entry `ExpenseScreen` (record.enter,
// limit-aware direct/request routing) with the SAME request-only form worker/driver use
// (request.submit, no cap) — pending/rejected, approved, and money-received sub-pages
// via ExpenseHistorySections. See expense-request-screen.tsx header for details.
export default function Page() {
  return <ExpenseRequestScreen variant="supervisor" />;
}

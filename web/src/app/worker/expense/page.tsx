import { ExpenseRequestScreen } from '@/components/screens/expense-request-screen';

// Auth + role pinning + shell come from the parent worker/layout.tsx.
// WORKER restructure (nav.ts): replaces the old /worker/requests route — expense
// reimbursement request form + three history sub-pages (pending/rejected, approved,
// money received). Mirrors the DRIVER-only /driver/expense precedent.
export default function Page() {
  return <ExpenseRequestScreen variant="worker" />;
}

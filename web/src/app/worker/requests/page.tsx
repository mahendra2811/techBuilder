import { ExpenseRequestScreen } from '@/components/screens/expense-request-screen';

// Auth + role pinning + shell come from the parent worker/layout.tsx.
export default function Page() {
  return <ExpenseRequestScreen variant="worker" />;
}

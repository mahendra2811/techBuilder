import { ExpenseScreen } from '@/components/screens/expense-screen';

// Auth + role pinning + shell come from the parent site-manager/layout.tsx.
export default function Page() {
  return <ExpenseScreen role="SITE_MANAGER" />;
}

import { ExpenseScreen } from '@/components/screens/expense-screen';

// Auth + role pinning + shell come from the parent team-head/layout.tsx.
export default function Page() {
  return <ExpenseScreen role="TEAM_HEAD" />;
}

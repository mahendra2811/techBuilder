import { RequestsScreen } from '@/components/screens/requests-screen';
import { ExpenseRequestScreen } from '@/components/screens/expense-request-screen';

// Auth + role pinning + shell come from the parent driver/layout.tsx.
// Stacked: the existing vehicle-switch request flow, then the expense-request
// flow (WO-5) with its own form + "my expense requests" list.
export default function Page() {
  return (
    <div className="grid gap-4">
      <RequestsScreen role="DRIVER" />
      <ExpenseRequestScreen variant="driver" />
    </div>
  );
}

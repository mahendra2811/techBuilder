import { ExpenseRequestScreen } from '@/components/screens/expense-request-screen';

// Auth + role pinning + shell come from the parent driver/layout.tsx.
// frozen.10 (DRV-2 nav restructure): replaces the old /driver/requests route for the
// DRIVER — expense reimbursement request form + "my expense requests" history only.
// The vehicle-change request form moved onto /driver/vehicle (see that page.tsx).
export default function Page() {
  return <ExpenseRequestScreen variant="driver" />;
}

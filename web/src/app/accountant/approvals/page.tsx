import { ApprovalsScreen } from '@/components/screens/approvals-screen';

// Auth + role pinning + shell come from the parent accountant/layout.tsx.
export default function Page() {
  return <ApprovalsScreen role="ACCOUNTANT" />;
}

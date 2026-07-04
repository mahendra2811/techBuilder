import { ApprovalsScreen } from '@/components/screens/approvals-screen';

// Auth + role pinning + shell come from the parent owner/layout.tsx.
export default function Page() {
  return <ApprovalsScreen role="OWNER" />;
}

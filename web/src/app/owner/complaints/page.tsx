import { ComplaintsInboxScreen } from '@/components/screens/complaints-inbox-screen';

// Auth + role pinning + shell come from the parent owner/layout.tsx.
export default function Page() {
  return <ComplaintsInboxScreen role="OWNER" />;
}

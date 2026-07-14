import { ComplaintsInboxScreen } from '@/components/screens/complaints-inbox-screen';

// Auth + role pinning + shell come from the parent site-manager/layout.tsx.
export default function Page() {
  return <ComplaintsInboxScreen role="SITE_MANAGER" />;
}

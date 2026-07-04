import { RequestsScreen } from '@/components/screens/requests-screen';

// Auth + role pinning + shell come from the parent site-manager/layout.tsx.
export default function Page() {
  return <RequestsScreen role="SITE_MANAGER" />;
}

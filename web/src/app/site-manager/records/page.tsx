import { RecordsScreen } from '@/components/screens/records-screen';

// Auth + role pinning + shell come from the parent site-manager/layout.tsx.
export default function Page() {
  return <RecordsScreen role="SITE_MANAGER" />;
}

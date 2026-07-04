import { PeopleScreen } from '@/components/screens/people-screen';

// Auth + role pinning + shell come from the parent site-manager/layout.tsx.
export default function Page() {
  return <PeopleScreen role="SITE_MANAGER" />;
}

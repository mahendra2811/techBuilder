import { PeopleScreen } from '@/components/screens/people-screen';

// Auth + role pinning + shell come from the parent owner/layout.tsx.
export default function Page() {
  return <PeopleScreen role="OWNER" />;
}

import { WagesScreen } from '@/components/screens/wages-screen';

// Auth + role pinning + shell come from the parent owner/layout.tsx.
export default function Page() {
  return <WagesScreen role="OWNER" />;
}

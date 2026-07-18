import { MaterialsScreen } from '@/components/screens/materials-screen';

// Auth + role pinning + shell come from the parent site-manager/layout.tsx.
export default function Page() {
  return <MaterialsScreen role="SITE_MANAGER" />;
}

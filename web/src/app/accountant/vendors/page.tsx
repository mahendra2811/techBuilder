import { VendorsScreen } from '@/components/screens/vendors-screen';

// Auth + role pinning + shell come from the parent accountant/layout.tsx.
// VendorsScreen takes no role prop — it's already role-agnostic (VendorsService
// scopes by site, not by caller role; see the file's own header comment).
export default function Page() {
  return <VendorsScreen />;
}

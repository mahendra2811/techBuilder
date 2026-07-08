import { VendorsScreen } from '@/components/screens/vendors-screen';

// Auth + role pinning + shell come from the parent site-manager/layout.tsx.
// GET /vendors already returns only org-wide + the SM's own site(s) shops.
export default function Page() {
  return <VendorsScreen />;
}

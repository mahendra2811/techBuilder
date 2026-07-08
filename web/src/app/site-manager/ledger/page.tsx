import { LedgerScreen } from '@/components/screens/ledger-screen';

// Auth + role pinning + shell come from the parent site-manager/layout.tsx.
export default function Page() {
  return <LedgerScreen role="SITE_MANAGER" />;
}

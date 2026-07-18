import { KhataScreen } from '@/components/screens/khata-screen';

// Auth + role pinning + shell come from the parent accountant/layout.tsx.
// ACC-2/ACC-3: the accountant's khata is now the 4-sub-page KhataScreen
// (give/receive/give-salary/who-holds-what), not the combined LedgerScreen.
export default function Page() {
  return <KhataScreen role="ACCOUNTANT" />;
}

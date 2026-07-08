import { LedgerScreen } from '@/components/screens/ledger-screen';

// Auth + role pinning + shell come from the parent team-head/layout.tsx.
// TEAM_HEAD sees the form + history only — the rollup section is Owner/SM.
export default function Page() {
  return <LedgerScreen role="TEAM_HEAD" />;
}

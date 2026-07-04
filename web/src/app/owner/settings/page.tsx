import { SettingsScreen } from '@/components/screens/settings-screen';

// Auth + role pinning (OWNER only — config.manage) + shell come from the
// parent owner/layout.tsx. There is no Site-Manager settings route: SM has
// wage.view but not config.manage, and nav.ts already hides this item for them.
export default function Page() {
  return <SettingsScreen />;
}

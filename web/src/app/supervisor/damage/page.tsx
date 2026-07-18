import { SupervisorDamageScreen } from '@/components/screens/supervisor-damage-screen';

// Auth + role pinning + shell come from the parent supervisor/layout.tsx.
// SUPERVISOR restructure: damage-report form + his crew's damage history, split off the
// old dashboard mini-form (see supervisor-crew-vehicles-card.tsx) onto its own page —
// mirrors the driver's dedicated /driver/damage page.
export default function Page() {
  return <SupervisorDamageScreen />;
}

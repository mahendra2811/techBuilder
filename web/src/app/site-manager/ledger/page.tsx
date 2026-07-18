import { KhataScreen } from '@/components/screens/khata-screen';

// Auth + role pinning + shell come from the parent site-manager/layout.tsx.
// ACC-2/ACC-3: the SM's khata is now the KhataScreen sub-page split too
// (give/receive/who-holds-what — no "give salary" section for SM).
export default function Page() {
  return <KhataScreen role="SITE_MANAGER" />;
}

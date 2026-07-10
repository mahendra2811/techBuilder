import { PersonInsightsScreen } from '@/components/screens/person-insights-screen';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PersonInsightsScreen userId={id} backHref="/owner/people" role="OWNER" />;
}

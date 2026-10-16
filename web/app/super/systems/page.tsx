import { getDict } from '@/lib/i18n/server';
import SystemsPanels from '@/components/super/SystemsPanels';
import { PageTitle } from '@/components/super/ui';

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.superPanel.systems.metaTitle };
}

export default async function SuperSystemsPage() {
  const d = await getDict();
  return (
    <>
      <PageTitle title={d.superPanel.systems.title} sub={d.superPanel.systems.sub} />
      <SystemsPanels />
    </>
  );
}

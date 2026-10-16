import { getEffectivePlanPresets } from '@/lib/platformSettings';
import { getDict } from '@/lib/i18n/server';
import PlansSettingsForm from '@/components/super/PlansSettingsForm';
import { PageTitle } from '@/components/super/ui';

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.superPanel.plans.metaTitle };
}

export default async function SuperPlansPage() {
  const [presets, d] = await Promise.all([getEffectivePlanPresets(), getDict()]);

  return (
    <>
      <PageTitle title={d.superPanel.plans.title} sub={d.superPanel.plans.sub} />
      <PlansSettingsForm presets={presets} />
    </>
  );
}

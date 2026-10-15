import { getEffectivePlanPresets } from '@/lib/platformSettings';
import PlansSettingsForm from '@/components/super/PlansSettingsForm';
import { PageTitle } from '@/components/super/ui';

export const metadata = { title: 'Tariflar — Super Admin' };

export default async function SuperPlansPage() {
  const presets = await getEffectivePlanPresets();

  return (
    <>
      <PageTitle title="Tariflar" sub="Standart tariflarni tahrirlash — filial, xodim soni va oylik to'lov" />
      <PlansSettingsForm presets={presets} />
    </>
  );
}

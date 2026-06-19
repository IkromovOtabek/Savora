import { getEffectivePlanPresets } from '@/lib/platformSettings';
import PlansSettingsForm from '@/components/super/PlansSettingsForm';

export const metadata = { title: 'Tariflar — Savora' };

export default async function SuperPlansPage() {
  const presets = await getEffectivePlanPresets();

  return (
    <>
      <div className="super-page-head">
        <div>
          <h1>Tariflar</h1>
          <p>Standart tariflarni qo&apos;lda tahrirlash — filial, xodim, oylik to&apos;lov</p>
        </div>
      </div>
      <PlansSettingsForm presets={presets} />
    </>
  );
}

import type { FeatureKey } from './features';
import { getDict } from './i18n/server';
import { tr } from './i18n/fmt';

type ActionState = { error?: string; success?: string } | null;

/** Modul o'chiq bo'lganda action xabari — joriy tilda (server action ichida chaqiriladi) */
export async function featureDisabledError(key: FeatureKey): Promise<ActionState> {
  const d = await getDict();
  return { error: tr(d.catalog.featureDisabledNamed, { label: d.catalog.features[key].label }) };
}

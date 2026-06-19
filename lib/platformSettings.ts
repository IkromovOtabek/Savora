import { getMasterModels } from './masterDb';
import {
  DEFAULT_PLAN_PRESETS,
  PlanPreset,
  PlanTier,
  getPlanPreset,
} from './plans';
import { IPlanOverride } from './models/master/PlatformSettings';

export async function getPlatformPlanOverrides(): Promise<Partial<Record<Exclude<PlanTier, 'custom'>, IPlanOverride>>> {
  const { PlatformSettings } = await getMasterModels();
  const doc = await PlatformSettings.findOne({ key: 'default' }).lean();
  return doc?.planOverrides ?? {};
}

export async function getEffectivePlanPresets(): Promise<Record<Exclude<PlanTier, 'custom'>, PlanPreset>> {
  const overrides = await getPlatformPlanOverrides();
  const result = { ...DEFAULT_PLAN_PRESETS };

  for (const tier of ['starter', 'pro', 'business'] as const) {
    const o = overrides[tier];
    if (!o) continue;
    result[tier] = {
      ...result[tier],
      ...(o.label ? { label: o.label } : {}),
      ...(o.description ? { description: o.description } : {}),
      ...(typeof o.maxFilial === 'number' ? { maxFilial: o.maxFilial } : {}),
      ...(typeof o.maxUsers === 'number' ? { maxUsers: o.maxUsers } : {}),
      ...(typeof o.monthlyPrice === 'number' ? { monthlyPrice: o.monthlyPrice } : {}),
    };
  }

  return result;
}

export async function savePlatformPlanOverrides(
  overrides: Partial<Record<Exclude<PlanTier, 'custom'>, IPlanOverride>>,
): Promise<void> {
  const { PlatformSettings } = await getMasterModels();
  await PlatformSettings.findOneAndUpdate(
    { key: 'default' },
    { $set: { planOverrides: overrides } },
    { upsert: true },
  );
}

export async function getPlanPresetEffective(tier: string): Promise<PlanPreset> {
  if (tier === 'custom') return getPlanPreset('custom');
  const presets = await getEffectivePlanPresets();
  return presets[tier as Exclude<PlanTier, 'custom'>] ?? presets.pro;
}

import { FeatureKey, TENANT_MODULES } from './features';

type ActionState = { error?: string; success?: string } | null;

export function featureDisabledError(key: FeatureKey): ActionState {
  return { error: `«${TENANT_MODULES[key].label}» moduli faol emas. Platforma egasiga murojaat qiling.` };
}

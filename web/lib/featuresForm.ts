import { FEATURE_KEYS, OrgFeatures } from './featureKeys';

export function parseFeaturesFromForm(formData: FormData): OrgFeatures {
  const features = {} as OrgFeatures;
  for (const key of FEATURE_KEYS) {
    features[key] = formData.get(`feature_${key}`) === 'on';
  }
  return features;
}

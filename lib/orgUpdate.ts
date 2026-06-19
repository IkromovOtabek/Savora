import { getMasterModels } from './masterDb';
import { IOrganization } from './models/master/Organization';
import { OrgFeatures } from './featureKeys';
import { BusinessType } from './businessTypes';
import { getPlanPreset, parsePlanTier, PlanTier } from './plans';

export type OrgStatus = IOrganization['status'];

export interface UpdateOrganizationInput {
  name?: string;
  ownerName?: string;
  phone?: string;
  status?: OrgStatus;
  expiresAt?: Date;
  planTier?: PlanTier;
  businessType?: BusinessType;
  features?: OrgFeatures;
  maxFilial?: number;
  maxUsers?: number;
  monthlyPayment?: number;
  agreementNote?: string;
  mustChangePassword?: boolean;
}

export async function updateOrganization(orgId: string, input: UpdateOrganizationInput): Promise<void> {
  const { Organization } = await getMasterModels();
  const org = await Organization.findById(orgId);
  if (!org) throw new Error('Do\'kon topilmadi.');

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error('Do\'kon nomi bo\'sh bo\'lmasligi kerak.');
    org.name = name;
  }
  if (input.ownerName !== undefined) org.ownerName = input.ownerName.trim() || undefined;
  if (input.phone !== undefined) org.phone = input.phone.trim() || undefined;
  if (input.status !== undefined) org.status = input.status;
  if (input.expiresAt !== undefined) org.expiresAt = input.expiresAt;

  if (input.planTier !== undefined) {
    const tier = parsePlanTier(input.planTier);
    const preset =
      tier === 'custom'
        ? getPlanPreset('custom')
        : await (async () => {
            const { getPlanPresetEffective } = await import('./platformSettings');
            return getPlanPresetEffective(tier);
          })();
    org.plan.tier = tier;
    if (input.maxFilial === undefined) org.plan.maxFilial = preset.maxFilial;
    if (input.maxUsers === undefined) org.plan.maxUsers = preset.maxUsers;
    if (input.monthlyPayment === undefined) org.plan.monthlyPayment = preset.monthlyPrice;
    if (tier !== 'custom') org.plan.agreementNote = undefined;
  }

  if (input.maxFilial !== undefined) org.plan.maxFilial = Math.max(1, input.maxFilial);
  if (input.maxUsers !== undefined) org.plan.maxUsers = Math.max(1, input.maxUsers);
  if (input.monthlyPayment !== undefined) org.plan.monthlyPayment = Math.max(0, input.monthlyPayment);
  if (input.agreementNote !== undefined) {
    org.plan.agreementNote = input.agreementNote.trim() || undefined;
  }

  if (org.plan.tier === 'custom' && !org.plan.agreementNote) {
    throw new Error('Kelishuv tarifida kelishuv matni kiritilishi shart.');
  }

  if (input.businessType !== undefined) org.businessType = input.businessType;
  if (input.features !== undefined) {
    org.features = input.features;
    org.markModified('features');
  }

  org.markModified('plan');
  await org.save();
}

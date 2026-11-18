import { getMasterModels } from './masterDb';
import { IOrganization } from './models/master/Organization';
import { OrgFeatures } from './featureKeys';
import { BusinessType, type IndustryProfile } from './businessTypes';
import { getPlanPreset, parsePlanTier, PlanTier } from './plans';
import { onboardingFeatureOverrides, planOnboarding, storedAnswersFor } from './onboardingQuestions';

export type OrgStatus = IOrganization['status'];

/**
 * Biznes turi preseti (§4.3 qo'shimchalari bilan) + saqlangan javoblar (faqat shu turga tegishli bo'lsa) → org.features farqlari.
 * Ishlatiladi: tarif o'zgarishi (yuqorida) va Super Admin «presetni qo'llash» (applyBusinessPresetAction).
 */
export function onboardingOverridesFor(
  org: Pick<IOrganization, 'onboardingAnswers'>,
  tier: string,
  businessType: string,
): Partial<OrgFeatures> {
  const answers = storedAnswersFor(org.onboardingAnswers, businessType);
  return onboardingFeatureOverrides({ tier, businessType, plan: planOnboarding(businessType, answers) });
}

/** Biznes turi o'zgarganda: shu turning mahsulot maydonlari / birliklari (javoblar shu turga tegishli bo'lsa — javob bo'yicha) */
export function typeProductSetup(
  org: Pick<IOrganization, 'onboardingAnswers'>,
  businessType: string,
): { productFieldsExtra: IOrganization['productFieldsExtra']; preferredUnits: IOrganization['preferredUnits'] } {
  const plan = planOnboarding(businessType, storedAnswersFor(org.onboardingAnswers, businessType));
  return {
    productFieldsExtra: plan.productFields.length ? plan.productFields : undefined,
    preferredUnits: plan.units.length ? plan.units : undefined,
  };
}

export interface UpdateOrganizationInput {
  name?: string;
  ownerName?: string;
  phone?: string;
  status?: OrgStatus;
  expiresAt?: Date;
  planTier?: PlanTier;
  businessType?: BusinessType;
  /** Sex kichik yo'nalishi; null — tozalash. Natijaviy tur `manufacturing` bo'lmasa har doim tozalanadi */
  industryProfile?: IndustryProfile | null;
  /** Faqat Super Admin override'lari (bazadan farqlar). null — hammasini tozalash. */
  features?: Partial<OrgFeatures> | null;
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
    const tierChanged = tier !== org.plan.tier;
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
    // Tarif o'zgarsa — Super Admin override'lari tozalanadi va modullar yangi tarif
    // standarti + biznes preseti bo'yicha hisoblanadi (alohida features berilmagan bo'lsa).
    // Aks holda do'kon eski modullar bilan qolib ketardi ("tarif o'zgarmadi" muammosi).
    if (tierChanged && input.features === undefined) {
      // Ustadan o'tgan (yangi) do'kon: javoblar bo'yicha farqlar yangi tarif doirasida qayta hisoblanadi.
      // Eski do'konlarda onboardingAnswers yo'q — avvalgidek tozalanadi.
      const f = org.onboardingAnswers ? onboardingOverridesFor(org, tier, input.businessType ?? org.businessType) : {};
      org.set('features', Object.keys(f).length ? f : undefined);
      org.markModified('features');
    }
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

  if (input.businessType !== undefined && input.businessType !== org.businessType) {
    // Tur o'zgarsa — mahsulot maydonlari va birliklar yangi tur preseti bo'yicha (eski turning qo'shimchalari qolmasin)
    const f = typeProductSetup(org, input.businessType);
    org.set('productFieldsExtra', f.productFieldsExtra);
    org.set('preferredUnits', f.preferredUnits);
  }
  if (input.businessType !== undefined) org.businessType = input.businessType;
  if (input.industryProfile !== undefined) {
    if (input.industryProfile) org.industryProfile = input.industryProfile;
    else org.set('industryProfile', undefined);
  }
  // Profil faqat ishlab chiqarish sexida ma'noli — tur o'zgarsa tozalanadi
  if (org.businessType !== 'manufacturing' && org.industryProfile) org.set('industryProfile', undefined);
  if (input.features !== undefined) {
    // null — barcha override'larni tozalash (biznes preseti + tarif standartiga qaytish)
    if (input.features === null) org.set('features', undefined);
    else org.features = input.features;
    org.markModified('features');
  }

  org.markModified('plan');
  await org.save();
}

import { getMasterModels } from './masterDb';

/**
 * Cheklistda ko'rinadigan qadamlar (biznes turi, xodim logini, Telegram ham) — lib/onboardingSteps.ts.
 * Bu yerda faqat saqlanadigan belgilar; ro'yxat Organization sxemasi bilan bir xil qoladi.
 */
export type OnboardingStep ='branchCreated' | 'productAdded' | 'saleMade' | 'profileCompleted';

/**
 * Onboarding qadamini bajarilgan deb belgilaydi (master DB'dagi organization).
 * Hech qachon throw qilmaydi — asosiy amalni buzmaydi. Faqat false→true yo'nalishida.
 */
export async function markOnboardingStep(organizationId: string | undefined, step: OnboardingStep): Promise<void> {
  try {
    if (!organizationId) return;
    const { Organization } = await getMasterModels();
    await Organization.updateOne(
      { _id: organizationId, [`onboarding.${step}`]: { $ne: true } },
      { $set: { [`onboarding.${step}`]: true } }
    );
  } catch {
    /* onboarding belgisi muvaffaqiyatsiz — e'tiborsiz qoldiramiz */
  }
}

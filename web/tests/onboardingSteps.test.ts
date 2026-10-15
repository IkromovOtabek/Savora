import { describe, it, expect } from 'vitest';
import { onboardingSteps, stepsProgress } from '@/lib/onboardingSteps';

describe('onboardingSteps', () => {
  it("yangi do'kon: faqat biznes turi bajarilgan", () => {
    const s = onboardingSteps({ businessType: 'phone_shop', onboarding: {} });
    expect(s.map((x) => x.id)).toEqual(['businessType', 'branch', 'product', 'sale', 'staff', 'telegram']);
    expect(s.filter((x) => x.done).map((x) => x.id)).toEqual(['businessType']);
    expect(stepsProgress(s)).toBe(17);
  });

  it('biznes turiga mos atama va maslahat', () => {
    const s = onboardingSteps({ businessType: 'phone_shop' });
    const product = s.find((x) => x.id === 'product')!;
    expect(product.label).toBe("Birinchi telefon qo'shing");
    expect(product.tip).toMatch(/IMEI/);
    const r = onboardingSteps({ businessType: 'restaurant' }).find((x) => x.id === 'product')!;
    expect(r.hint).toMatch(/Menyu/);
  });

  it('xodim va Telegram mavjud maydonlardan hisoblanadi', () => {
    const s = onboardingSteps({
      businessType: 'general',
      onboarding: { branchCreated: true, productAdded: true, saleMade: true },
      users: [{ role: 'admin' }, { role: 'user' }],
      telegramChatId: '123',
    });
    expect(stepsProgress(s)).toBe(100);
  });

  it('faqat admin login — xodim qadami bajarilmagan', () => {
    const s = onboardingSteps({ businessType: 'general', users: [{ role: 'admin' }] });
    expect(s.find((x) => x.id === 'staff')!.done).toBe(false);
  });
});

import { parseBusinessType, type BusinessType } from './businessTypes';
import { presetFor } from './businessPresets';
import { DEFAULT_LOCALE, type Locale } from './i18n/config';
import { getDictionary } from './i18n/dict';
import { tr } from './i18n/fmt';

/**
 * Onboarding cheklisti qadamlari (sof funksiya — test qilinadi, DB'ga tegmaydi).
 * Saqlanadigan belgilar `org.onboarding` (lib/onboarding.ts → markOnboardingStep) o'zgarmaydi;
 * "xodim logini" va "Telegram" qadamlari mavjud maydonlardan hisoblanadi.
 * Matnlar lug'atdan (`shell.onboarding.steps`, `catalog.terms`); standart til — uz.
 */

export type OnboardingStepId = 'businessType' | 'branch' | 'product' | 'sale' | 'staff' | 'telegram';

export interface OnboardingStepView {
  id: OnboardingStepId;
  done: boolean;
  label: string;
  hint: string;
  href: string;
  /** Biznes turiga xos maslahat (faqat bajarilmagan qadam uchun ko'rsatiladi) */
  tip?: string;
}

export interface OnboardingOrgInput {
  businessType?: string;
  onboarding?: { branchCreated?: boolean; productAdded?: boolean; saleMade?: boolean; profileCompleted?: boolean };
  telegramChatId?: string;
  users?: { role?: 'admin' | 'user' }[];
}

export function onboardingSteps(org: OnboardingOrgInput, locale: Locale = DEFAULT_LOCALE): OnboardingStepView[] {
  const bt: BusinessType = parseBusinessType(org.businessType || 'general');
  const d = getDictionary(locale);
  const t = d.shell.onboarding.steps;
  const terms = d.catalog.terms[bt];
  const preset = presetFor(bt);
  const o = org.onboarding ?? {};
  const tips = d.shell.onboarding.tips[bt] ?? {};
  const hasStaff = (org.users ?? []).some((u) => u.role === 'user');
  const item = terms.item.toLowerCase();

  return [
    {
      id: 'businessType',
      done: !!org.businessType,
      label: t.businessType.label,
      hint: tr(t.businessType.hint, { label: d.catalog.businessTypes[bt].label }),
      href: '/help#biznes-turi',
    },
    {
      id: 'branch',
      done: !!o.branchCreated,
      label: t.branch.label,
      hint: t.branch.hint,
      href: '/app/users#filial',
    },
    {
      id: 'product',
      done: !!o.productAdded,
      label: tr(t.product.label, { item }),
      hint: tr(t.product.hint, { items: terms.items, item }),
      href: '/app/products/new',
      tip: tips.product,
    },
    {
      id: 'sale',
      done: !!o.saleMade,
      label: t.sale.label,
      hint: preset.nasiya ? t.sale.hintNasiya : t.sale.hint,
      href: '/app/sales/new',
      tip: tips.sale,
    },
    {
      id: 'staff',
      done: hasStaff,
      label: t.staff.label,
      hint: t.staff.hint,
      href: '/app/users',
    },
    {
      id: 'telegram',
      done: !!org.telegramChatId,
      label: t.telegram.label,
      hint: t.telegram.hint,
      href: '/app/profile#telegram',
    },
  ];
}

/** Bajarilgan qadamlar foizi (0–100) */
export function stepsProgress(steps: OnboardingStepView[]): number {
  if (steps.length === 0) return 100;
  return Math.round((steps.filter((s) => s.done).length / steps.length) * 100);
}

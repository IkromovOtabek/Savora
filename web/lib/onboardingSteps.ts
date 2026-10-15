import { BUSINESS_TYPES, parseBusinessType, termsFor, type BusinessType } from './businessTypes';
import { presetFor } from './businessPresets';

/**
 * Onboarding cheklisti qadamlari (sof funksiya — test qilinadi, DB'ga tegmaydi).
 * Saqlanadigan belgilar `org.onboarding` (lib/onboarding.ts → markOnboardingStep) o'zgarmaydi;
 * "xodim logini" va "Telegram" qadamlari mavjud maydonlardan hisoblanadi.
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

/** Biznes turiga xos birinchi qadam maslahatlari */
const TIPS: Partial<Record<BusinessType, { product?: string; sale?: string }>> = {
  phone_shop: {
    product: 'Har telefonni IMEI bilan kiriting — sotuvda skaner aynan o\'sha qurilmani topadi.',
    sale: 'Birinchi nasiyani rasmiylashtiring: boshlang\'ich to\'lov va 12 oygacha muddat.',
  },
  electronics: {
    product: 'Seriya raqamini kiriting — kafolat va qaytarishda kerak bo\'ladi.',
    sale: 'Nasiya yoki bank krediti bilan sotib ko\'ring — «Kredit kassa»da bank qoldig\'i ko\'rinadi.',
  },
  furniture: {
    product: 'Rasm qo\'shing — mijozga katalog ko\'rsatish oson bo\'ladi.',
    sale: 'Oldindan to\'lov + bo\'lib to\'lash: boshlang\'ich summani kiriting, jadval o\'zi tuziladi.',
  },
  clothing: { product: 'Artikul va shtrix-kod bilan kiriting — kassada skaner tez ishlaydi.' },
  grocery: {
    product: 'Eng ko\'p sotiladigan 20 ta tovardan boshlang — qolganini asta qo\'shasiz.',
    sale: 'Qarzga berganlarni «Daftar»ga yozing — SMS eslatma o\'zi boradi.',
  },
  building: { sale: 'Ustalarga qarzni «Daftar»da yuriting — qaytarish sanasini belgilang.' },
  cosmetics: { product: 'Rasmli katalog: har tovarga surat qo\'shing.' },
  pharmacy: { product: 'Shtrix-kod bilan kiriting — sotuv skaner orqali soniyalarda.' },
  auto_parts: { product: 'Kod/artikul bo\'yicha kiriting — qidiruv shu kod bilan ishlaydi.', sale: 'Doimiy ustalar qarzini «Daftar»da yuriting.' },
  wholesale: { sale: 'Katta mijozlar qarzini «Daftar»da nazorat qiling.' },
  restaurant: { product: 'Menyuni taomlar bilan to\'ldiring, rasm qo\'shing.' },
  service: { product: 'Xizmatlar ro\'yxatini narxi bilan kiriting.' },
};

export function onboardingSteps(org: OnboardingOrgInput): OnboardingStepView[] {
  const bt = parseBusinessType(org.businessType || 'general');
  const terms = termsFor(bt);
  const preset = presetFor(bt);
  const o = org.onboarding ?? {};
  const tips = TIPS[bt] ?? {};
  const hasStaff = (org.users ?? []).some((u) => u.role === 'user');
  const item = terms.item.toLowerCase();

  return [
    {
      id: 'businessType',
      done: !!org.businessType,
      label: 'Biznes turi tanlandi',
      hint: `«${BUSINESS_TYPES[bt].label}» — menyu va modullar shunga moslandi`,
      href: '/help#biznes-turi',
    },
    {
      id: 'branch',
      done: !!o.branchCreated,
      label: 'Filial yarating',
      hint: 'Do\'koningizning asosiy nuqtasini qo\'shing',
      href: '/app/users#filial',
    },
    {
      id: 'product',
      done: !!o.productAdded,
      label: `Birinchi ${item} qo'shing`,
      hint: `${terms.items}ga kamida bitta ${item} kiriting`,
      href: '/app/products/new',
      tip: tips.product,
    },
    {
      id: 'sale',
      done: !!o.saleMade,
      label: 'Birinchi sotuv',
      hint: preset.nasiya ? 'Naqd yoki nasiyaga birinchi sotuvni qiling' : 'Birinchi sotuvni rasmiylashtiring',
      href: '/app/sales/new',
      tip: tips.sale,
    },
    {
      id: 'staff',
      done: hasStaff,
      label: 'Xodimga login bering',
      hint: 'Har xodim o\'z logini bilan — kim nima qilgani ko\'rinadi',
      href: '/app/users',
    },
    {
      id: 'telegram',
      done: !!org.telegramChatId,
      label: 'Telegram\'ni ulang',
      hint: 'Kechikkan to\'lov va kunlik hisobot Telegram\'ga keladi',
      href: '/app/profile#telegram',
    },
  ];
}

/** Bajarilgan qadamlar foizi (0–100) */
export function stepsProgress(steps: OnboardingStepView[]): number {
  if (steps.length === 0) return 100;
  return Math.round((steps.filter((s) => s.done).length / steps.length) * 100);
}

import { cookies } from 'next/headers';

export type Locale = 'uz' | 'ru';
export const LOCALES: Locale[] = ['uz', 'ru'];
export const LOCALE_COOKIE = 'locale';

export async function getLocale(): Promise<Locale> {
  try {
    const store = await cookies();
    const v = store.get(LOCALE_COOKIE)?.value;
    return v === 'ru' ? 'ru' : 'uz';
  } catch {
    return 'uz';
  }
}

interface LandingDict {
  nav: { demo: string; features: string; pricing: string; faq: string; login: string; signup: string };
  hero: {
    badge: string; title1: string; titleAccent: string; title2: string; sub: string;
    ctaPrimary: string; ctaSecondary: string; trust1: string; trust2: string; trust3: string;
  };
}

/** Landing (marketing) lug'ati — UZ/RU */
const dict: Record<Locale, LandingDict> = {
  uz: {
    nav: { demo: 'Demo', features: 'Imkoniyatlar', pricing: 'Tariflar', faq: 'Savollar', login: 'Kirish', signup: "Ro'yxatdan o'tish" },
    hero: {
      badge: "7 kun bepul sinov — karta talab qilinmaydi",
      title1: "Do'koningizni", titleAccent: 'bitta tizimdan', title2: 'boshqaring',
      sub: "Savora — ombor, sotuv, nasiya, kassa, filiallar va xodimlarni bir joyda. Zamonaviy, tez va ishonchli. O'zbekiston do'konlari uchun maxsus yaratilgan.",
      ctaPrimary: "Ro'yxatdan o'tish — bepul boshlash",
      ctaSecondary: 'Kirish',
      trust1: 'Kredit karta kerak emas', trust2: '5 daqiqada sozlash', trust3: 'Istalgan vaqt bekor qilish',
    },
  },
  ru: {
    nav: { demo: 'Демо', features: 'Возможности', pricing: 'Тарифы', faq: 'Вопросы', login: 'Войти', signup: 'Регистрация' },
    hero: {
      badge: '7 дней бесплатно — карта не требуется',
      title1: 'Управляйте магазином', titleAccent: 'из одной системы', title2: '',
      sub: 'Savora — склад, продажи, рассрочка, касса, филиалы и сотрудники в одном месте. Современно, быстро и надёжно. Создано специально для магазинов Узбекистана.',
      ctaPrimary: 'Регистрация — начать бесплатно',
      ctaSecondary: 'Войти',
      trust1: 'Кредитная карта не нужна', trust2: 'Настройка за 5 минут', trust3: 'Отмена в любое время',
    },
  },
};

export type Dict = LandingDict;

export async function getDict(): Promise<Dict> {
  const locale = await getLocale();
  return dict[locale];
}

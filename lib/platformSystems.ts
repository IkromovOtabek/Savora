import type { IconName } from '@/components/icons/Icon';
import { LOCALHOST_LINKS } from './urls';

/** Super Admin sidebar — loyiha tizim funksiyalari */
export const PLATFORM_SYSTEMS: {
  id: string;
  label: string;
  description: string;
  href: string;
  icon: IconName;
  external?: boolean;
}[] = [
  {
    id: 'biznes',
    label: 'Bizneslar boshqaruvi',
    description: 'Client bizneslarini yaratish, muddat va holatni boshqarish',
    href: '/super',
    icon: 'building',
  },
  {
    id: 'tariflar',
    label: 'Tariflar',
    description: 'Filial, xodim, oylik to\'lov — qo\'lda tahrirlash',
    href: '/super/plans',
    icon: 'plans',
  },
  {
    id: 'modullar-savdo',
    label: 'Variant, Kredit, Kassa',
    description: 'Biznes → Modullar: Variant (nasiya), Kredit kassa (banklar), Kassa (tushum)',
    href: '/super',
    icon: 'wallet',
  },
  {
    id: 'kirim-chiqim',
    label: 'Kirim-Chiqim',
    description: 'Biznes egasi uchun kirim va chiqimlar jurnali',
    href: '/super',
    icon: 'chart',
  },
  {
    id: 'modullar',
    label: 'Modul tizimi',
    description: 'Biznes tanlang → Modullar bo\'limidan yoqing',
    href: '/super',
    icon: 'grid',
  },
  {
    id: 'eslatma',
    label: 'Obuna eslatmalari',
    description: '2 kun qolganda kunlik xabar',
    href: '/super/systems#notify',
    icon: 'bell',
  },
  {
    id: 'telefon',
    label: 'Biznes turlari',
    description: '7 tur: umumiy, telefon, restoran...',
    href: '/super/organizations/new',
    icon: 'phone',
  },
  {
    id: 'cron',
    label: 'Obuna muddati (Cron)',
    description: 'Muddati tugagan bizneslarni to\'xtatish',
    href: '/super/systems#expire',
    icon: 'clock',
  },
  {
    id: 'export',
    label: 'CSV export',
    description: 'Mahsulot va sotuvlarni eksport',
    href: '/super/systems#export',
    icon: 'download',
  },
  {
    id: 'telegram',
    label: 'Telegram bot',
    description: 'Sotuv va obuna eslatmalari',
    href: '/super/systems#telegram',
    icon: 'send',
  },
  {
    id: 'marketing',
    label: 'Marketing sayt',
    description: 'Landing, ro\'yxatdan o\'tish va tariflar',
    href: LOCALHOST_LINKS.marketing,
    icon: 'globe',
    external: true,
  },
];

export const SUPER_NAV = [
  { href: '/super', label: 'Bizneslar', icon: 'building' as IconName, exact: true },
  { href: '/super/plans', label: 'Tariflar', icon: 'plans' as IconName },
  { href: '/super/organizations/new', label: 'Yangi biznes', icon: 'plus' as IconName },
] as const;

/** /super/systems sahifasidagi bo'limlar */
export const SYSTEMS_PATH = '/super/systems';

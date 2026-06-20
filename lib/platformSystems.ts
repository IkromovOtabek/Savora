import type { IconName } from '@/components/icons/Icon';

/** Super Admin — asosiy menyu (haqiqiy sahifalar, takrorsiz) */
export const SUPER_NAV = [
  { href: '/super', label: 'Bizneslar', icon: 'building' as IconName, exact: true },
  { href: '/super/payments', label: 'To\'lovlar', icon: 'wallet' as IconName },
  { href: '/super/plans', label: 'Tariflar', icon: 'plans' as IconName },
  { href: '/super/organizations/new', label: 'Yangi biznes', icon: 'plus' as IconName },
  { href: '/super/systems', label: 'Tizim funksiyalari', icon: 'settings' as IconName },
] as const;

/** /super/systems sahifasidagi bo'limlar */
export const SYSTEMS_PATH = '/super/systems';

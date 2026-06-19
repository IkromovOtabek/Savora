import type { IconName } from '@/components/icons/Icon';
import { LOCALHOST_LINKS } from './urls';

/** Super Admin — asosiy menyu (haqiqiy sahifalar, takrorsiz) */
export const SUPER_NAV = [
  { href: '/super', label: 'Bizneslar', icon: 'building' as IconName, exact: true },
  { href: '/super/plans', label: 'Tariflar', icon: 'plans' as IconName },
  { href: '/super/organizations/new', label: 'Yangi biznes', icon: 'plus' as IconName },
  { href: '/super/systems', label: 'Tizim funksiyalari', icon: 'settings' as IconName },
] as const;

/** Marketing sayt — tashqi havola (footer) */
export const MARKETING_LINK = {
  label: 'Marketing sayt',
  href: LOCALHOST_LINKS.marketing,
  icon: 'globe' as IconName,
};

/** /super/systems sahifasidagi bo'limlar */
export const SYSTEMS_PATH = '/super/systems';

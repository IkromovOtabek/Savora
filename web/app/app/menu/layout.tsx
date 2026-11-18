import { requireFeature } from '@/lib/auth';
import '@/components/restaurant/settings/settings.css';
import '@/components/restaurant/menu/menu.css';

/** Restoran «Menyu» bo'limi (/app/menu): modul `tables`; huquqlar sahifalarda (menuAdmin.ts) */
export default async function MenuLayout({ children }: { children: React.ReactNode }) {
  await requireFeature('tables');
  return children;
}

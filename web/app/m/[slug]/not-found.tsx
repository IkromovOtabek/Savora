import { getDict } from '@/lib/i18n/server';
import QrState from '@/components/restaurant/qr/QrState';

/** Noto'g'ri slug yoki do'konda QR-menyu moduli o'chiq / do'kon faol emas (sabab ochilmaydi) */
export default async function RestaurantPageNotFound() {
  const q = (await getDict()).restaurant.qrMenu;
  return <QrState icon="utensils" title={q.storeNotFoundTitle} text={q.storeNotFoundText} />;
}

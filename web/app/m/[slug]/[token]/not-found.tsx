import { getDict } from '@/lib/i18n/server';
import QrState from '@/components/restaurant/qr/QrState';

/** Noto'g'ri / eskirgan QR yoki do'konda QR-menyu moduli o'chiq (server farqini ochmaydi — `qrUnavailable`) */
export default async function QrMenuNotFound() {
  const q = (await getDict()).restaurant.qrMenu;
  return <QrState icon="qr" title={q.notFoundTitle} text={q.notFoundText} />;
}

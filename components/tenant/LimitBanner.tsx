import Link from 'next/link';
import Icon from '@/components/icons/Icon';

/**
 * Yumshoq tarif chegarasi — limitga yetganda yoki oshganda ko'rsatiladi.
 * Bloklamaydi, faqat tarifni yangilashga/to'lovga yo'naltiradi (client tiqilib qolmaydi).
 */
export default function LimitBanner({
  label,
  current,
  max,
  showFrom = 'reached',
}: {
  label: string;       // masalan "Filiallar" yoki "Mahsulotlar"
  current: number;
  max: number;
  /** 'reached' — limitga yetganda; 'near' — 80% dan ko'p bo'lganda */
  showFrom?: 'reached' | 'near';
}) {
  if (!max || max <= 0) return null;
  const over = current >= max;
  const near = current >= Math.floor(max * 0.8);
  const visible = showFrom === 'near' ? near : over;
  if (!visible) return null;

  return (
    <div className="limit-banner">
      <div className="limit-banner-main">
        <span className="limit-banner-icon"><Icon name="bell" size={18} /></span>
        <div>
          <strong>
            {over ? `${label} tarif limitiga yetdi` : `${label} limitiga yaqinlashdingiz`} ({current}/{max})
          </strong>
          <div className="limit-banner-sub">
            Ko&apos;proq {label.toLowerCase()} qo&apos;shish uchun tarifni yangilang — bu sizni
            to&apos;xtatmaydi, faqat imkoniyatni kengaytiradi.
          </div>
        </div>
      </div>
      <Link href="/app/profile#obuna-tolovi" className="btn btn-primary btn-sm btn-with-icon">
        <Icon name="wallet" size={15} /> Tarifni yangilash
      </Link>
    </div>
  );
}

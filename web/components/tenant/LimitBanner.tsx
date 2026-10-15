import Link from 'next/link';
import Icon from '@/components/icons/Icon';
import '@/components/tenant/styles/admin.css';

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

  const pct = Math.min(100, Math.round((current / max) * 100));

  return (
    <div className="ad-limit" role="status">
      <span className={`ad-sq ${over ? 'ad-sq--danger' : 'ad-sq--gold'}`} aria-hidden="true"><Icon name="bell" size={16} /></span>
      <div className="ad-limit-body">
        <p className="ad-limit-title">
          {over ? `${label} tarif limitiga yetdi` : `${label} limitiga yaqinlashdingiz`}
        </p>
        <div
          className={`ad-meter ${over ? 'ad-meter--over' : 'ad-meter--warn'}`}
          role="meter"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-valuenow={current}
        >
          <div className="ad-meter-top"><span>{label}</span><b>{current} / {max}</b></div>
          <div className="ad-meter-bar"><div className="ad-meter-fill" style={{ width: `${pct}%` }} /></div>
        </div>
        <p className="ad-limit-sub">
          Ko&apos;proq {label.toLowerCase()} qo&apos;shish uchun tarifni yangilang — bu sizni
          to&apos;xtatmaydi, faqat imkoniyatni kengaytiradi.
        </p>
      </div>
      <Link href="/app/profile#obuna-tolovi" className="btn btn-primary btn-sm btn-with-icon">
        <Icon name="wallet" size={15} /> Tarifni yangilash
      </Link>
    </div>
  );
}

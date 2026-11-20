'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import Icon from '@/components/icons/Icon';
import { useDict } from '@/lib/i18n/client';

/**
 * Menyu sarlavhasidagi «qo'shish» tugmalari — tanlangan bo'limga mos (?section=bar: «Bar mahsuloti qo'shish»,
 * forma Bar bo'limi bilan ochiladi). Bo'lim MenuBoard'da almashsa URL (replaceState) orqali shu yerga yetadi.
 */
export default function MenuAddActions({ branchId, canCreate, canEdit, barMenu }: {
  branchId: string | null;
  canCreate: boolean;
  canEdit: boolean;
  /** «Bar bo'limi va barkod» moduli */
  barMenu: boolean;
}) {
  const t = useDict().menu;
  const sp = useSearchParams();
  const bar = barMenu && sp.get('section') === 'bar';
  const q = (extra: Record<string, string>) => {
    const s = new URLSearchParams({ ...extra, ...(bar ? { section: 'bar' } : {}), ...(branchId ? { branch: branchId } : {}) }).toString();
    return s ? `?${s}` : '';
  };
  return (
    <div className="t-page-actions mn-head-actions">
      {canEdit && (
        <Link href={`/app/menu/new${q({ type: 'goods' })}`} className="btn btn-tinted btn-with-icon">
          <Icon name="box" size={18} /> {t.addGoods}
        </Link>
      )}
      {canCreate && (
        <Link href={`/app/menu/new${q({})}`} className="btn btn-primary btn-with-icon">
          <Icon name={bar ? 'cup' : 'plus'} size={18} /> {bar ? t.addBar : t.addDish}
        </Link>
      )}
    </div>
  );
}

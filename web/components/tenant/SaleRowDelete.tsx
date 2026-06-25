'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cancelSaleAction } from '@/app/actions/sales';
import { toast } from '@/lib/toast';
import Icon from '@/components/icons/Icon';

export default function SaleRowDelete({ saleId, saleNo }: { saleId: string; saleNo: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onDelete() {
    if (!confirm(`${saleNo} sotuvini bekor qilasizmi? Mahsulot omborga qaytadi.`)) return;
    setBusy(true);
    const fd = new FormData();
    fd.set('saleId', saleId);
    const res = await cancelSaleAction(null, fd);
    setBusy(false);
    if (res?.error) { toast(res.error, 'error'); return; }
    toast(res?.success ?? 'Bekor qilindi.', 'success');
    router.refresh();
  }

  return (
    <button type="button" className="icon-btn icon-btn--danger" title="Bekor qilish" onClick={onDelete} disabled={busy}>
      <Icon name="trash" size={16} />
    </button>
  );
}

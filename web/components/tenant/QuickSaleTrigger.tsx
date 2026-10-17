'use client';

import { useState } from 'react';
import Icon from '@/components/icons/Icon';
import QuickSaleModal from '@/components/tenant/QuickSaleModal';
import { useDict } from '@/lib/i18n/client';

export default function QuickSaleTrigger() {
  const [open, setOpen] = useState(false);
  const d = useDict();

  return (
    <>
      <button type="button" className="t-qa t-qa--accent" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span className="t-qa-ic"><Icon name="search" size={20} /></span>
        <span className="t-qa-t">{d.sales.quickSale.title}<small>{d.sales.quickSale.scanner}</small></span>
      </button>
      <QuickSaleModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

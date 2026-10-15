'use client';

import { useState } from 'react';
import Icon from '@/components/icons/Icon';
import QuickSaleModal from '@/components/tenant/QuickSaleModal';

export default function QuickSaleTrigger() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className="t-qa t-qa--accent" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span className="t-qa-ic"><Icon name="search" size={20} /></span>
        <span className="t-qa-t">Tez sotuv<small>Skaner (pistolet)</small></span>
      </button>
      <QuickSaleModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

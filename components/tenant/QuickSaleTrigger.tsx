'use client';

import { useState } from 'react';
import Icon from '@/components/icons/Icon';
import QuickSaleModal from '@/components/tenant/QuickSaleModal';

export default function QuickSaleTrigger() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className="quick-action quick-action--accent btn-with-icon" onClick={() => setOpen(true)}>
        <Icon name="search" size={22} />
        <span>Tez sotuv<small>Skaner pistalet</small></span>
      </button>
      <QuickSaleModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

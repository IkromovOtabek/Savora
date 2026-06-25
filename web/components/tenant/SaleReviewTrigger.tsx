'use client';

import { useState } from 'react';
import ReviewModal from './ReviewModal';

/** Sotuv yakunlangach (created=1) avtomatik baho modalini ochadi */
export default function SaleReviewTrigger({ saleId }: { saleId: string }) {
  const [open, setOpen] = useState(true);
  return <ReviewModal open={open} onClose={() => setOpen(false)} saleId={saleId} />;
}

'use client';

import { useEffect, useRef } from 'react';

/**
 * Mobil (≤900px) master-detail: tanlangan tafsilot ochilganda uni ekran tepasiga olib keladi.
 * Desktopda ro'yxat joyida qoladi (Link scroll={false}).
 */
export default function ScrollIntoViewMobile({ dep }: { dep: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (window.matchMedia('(max-width: 900px)').matches) {
      ref.current?.scrollIntoView({ block: 'start' });
    }
  }, [dep]);
  return <span ref={ref} aria-hidden="true" className="cl-anchor" />;
}

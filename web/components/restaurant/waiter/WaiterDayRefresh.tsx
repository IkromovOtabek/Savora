'use client';

import { useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/icons/Icon';

/** Avtomatik yangilash oralig'i: ochiq stollar (tayyor taom, QR) va yangi yopilgan hisoblar */
const EVERY_MS = 30_000;

/**
 * «Mening kunim»: sahifa ko'rinib turganda har 30 s da va sahifaga qaytganda server ma'lumotini yangilaydi
 * (router.refresh — server komponent qayta chiziladi); qo'lda «Yangilash» tugmasi.
 */
export default function WaiterDayRefresh({ label, updatedLabel }: { label: string; updatedLabel: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  useEffect(() => {
    const tick = () => { if (!document.hidden) start(() => router.refresh()); };
    const timer = window.setInterval(tick, EVERY_MS);
    const onVis = () => { if (!document.hidden) tick(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVis); };
  }, [router]);

  return (
    <div className="wd-refresh">
      <span className="wd-refresh-t" aria-live="polite">{updatedLabel}</span>
      <button type="button" className="btn btn-tinted btn-sm" onClick={() => start(() => router.refresh())} disabled={pending} aria-busy={pending}>
        <Icon name="repeat" size={16} /> {label}
      </button>
    </div>
  );
}

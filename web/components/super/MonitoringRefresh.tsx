'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/icons/Icon';

const INTERVAL_SEC = 30;

/** Monitoring: qo'lda yangilash + 30 s avtomatik yangilanish (brauzerda eslab qolinadi) */
export default function MonitoringRefresh({ generatedAt }: { generatedAt: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [auto, setAuto] = useState(false);
  const [left, setLeft] = useState(INTERVAL_SEC);

  useEffect(() => {
    try {
      setAuto(localStorage.getItem('sa-mon-auto') === '1');
    } catch { /* localStorage yo'q */ }
  }, []);

  useEffect(() => {
    if (!auto) return;
    setLeft(INTERVAL_SEC);
    const t = setInterval(() => {
      setLeft((n) => {
        if (n <= 1) {
          start(() => router.refresh());
          return INTERVAL_SEC;
        }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [auto, router]);

  const toggle = () => {
    const next = !auto;
    setAuto(next);
    try { localStorage.setItem('sa-mon-auto', next ? '1' : '0'); } catch { /* ignore */ }
  };

  const t = new Date(generatedAt);
  const hh = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')}`;

  return (
    <div className="sa-mon-refresh">
      <span className="sa-hint">Yangilangan: <b className="sa-num">{hh}</b></span>
      <button type="button" className={`sa-btn sa-btn--sm ${auto ? 'sa-btn--tinted' : 'sa-btn--gray'}`} onClick={toggle} aria-pressed={auto}>
        <Icon name="repeat" size={14} />
        {auto ? `Avto (${left} s)` : 'Avto yangilash'}
      </button>
      <button type="button" className="sa-btn sa-btn--sm sa-btn--filled" onClick={() => start(() => router.refresh())} disabled={pending}>
        <Icon name="history" size={14} />
        {pending ? 'Yangilanmoqda…' : 'Yangilash'}
      </button>
    </div>
  );
}

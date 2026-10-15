'use client';

import { useEffect, useState } from 'react';
import Icon from '@/components/icons/Icon';
import '@/components/tenant/styles/admin.css';

function formatTime(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export default function TenantClock() {
  const [time, setTime] = useState('');

  useEffect(() => {
    const tick = () => setTime(formatTime(new Date()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="ad-clock" role="timer" aria-label="Joriy vaqt">
      <Icon name="clock" size={14} />
      <span suppressHydrationWarning>
        {time || '--:--:--'}
      </span>
    </div>
  );
}

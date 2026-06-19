'use client';

import { useEffect, useState } from 'react';
import Icon from '@/components/icons/Icon';

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
    <div className="tenant-clock" aria-live="polite" aria-label="Joriy vaqt">
      <Icon name="clock" size={16} className="tenant-clock-icon" />
      <span className="tenant-clock-time" suppressHydrationWarning>
        {time || '--:--:--'}
      </span>
    </div>
  );
}

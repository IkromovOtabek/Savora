'use client';

import { useEffect, useState, useCallback } from 'react';
import type { ToastDetail, ToastType } from '@/lib/toast';
import Icon, { IconName } from '@/components/icons/Icon';

interface ToastItem extends ToastDetail {
  id: number;
  type: ToastType;
}

const ICONS: Record<ToastType, IconName> = {
  success: 'check',
  error: 'close',
  info: 'bell',
  warn: 'bell',
};

const TITLES: Record<ToastType, string> = {
  success: 'Muvaffaqiyatli',
  error: 'Xatolik',
  info: 'Eslatma',
  warn: 'Diqqat',
};

let counter = 0;

export default function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  const remove = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    function onToast(e: Event) {
      const detail = (e as CustomEvent<ToastDetail>).detail;
      if (!detail?.message) return;
      const id = ++counter;
      const type = detail.type ?? 'success';
      setItems((prev) => [...prev, { id, message: detail.message, type }]);
      setTimeout(() => remove(id), 3600);
    }
    window.addEventListener('app:toast', onToast as EventListener);
    return () => window.removeEventListener('app:toast', onToast as EventListener);
  }, [remove]);

  if (items.length === 0) return null;

  return (
    <div className="toast-layer" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast-modal toast-modal--${t.type}`}>
          <span className="toast-modal-icon"><Icon name={ICONS[t.type]} size={20} /></span>
          <div className="toast-modal-body">
            <div className="toast-modal-title">{TITLES[t.type]}</div>
            <div className="toast-modal-msg">{t.message}</div>
          </div>
          <button className="toast-modal-close" onClick={() => remove(t.id)} aria-label="Yopish">
            <Icon name="close" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}

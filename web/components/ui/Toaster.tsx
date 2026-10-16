'use client';

import { useEffect, useState, useCallback } from 'react';
import type { ToastDetail, ToastType } from '@/lib/toast';
import Icon, { IconName } from '@/components/icons/Icon';
import { useDict } from '@/lib/i18n/client';

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

let counter = 0;

export default function Toaster() {
  const d = useDict();
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
            <div className="toast-modal-title">{d.ui.toast.titles[t.type]}</div>
            <div className="toast-modal-msg">{t.message}</div>
          </div>
          <button className="toast-modal-close" onClick={() => remove(t.id)} aria-label={d.common.close}>
            <Icon name="close" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}

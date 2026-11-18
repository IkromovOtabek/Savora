'use client';

import { useEffect, useId, useRef } from 'react';
import Icon from '@/components/icons/Icon';
import { useDict } from '@/lib/i18n/client';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Keng oyna (jadval bilan) */
  wide?: boolean;
}

/**
 * Native <dialog> (modal): fokus oyna ichida, Esc yopadi, orqa fon bosilmaydi. Yopilganda fokus
 * oynani ochgan tugmaga qaytadi (brauzer o'zi).
 */
export default function Dialog({ open, onClose, title, children, wide }: Props) {
  const d = useDict();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`pr-dialog${wide ? ' pr-dialog--wide' : ''}`}
      aria-labelledby={titleId}
      onClose={() => {
        if (open) onClose();
      }}
    >
      {open && (
        <div className="pr-dialog-in">
          <div className="pr-dialog-head">
            <h2 className="pr-h" id={titleId}>{title}</h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label={d.common.close} title={d.common.close}>
              <Icon name="close" size={18} />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

/**
 * Tasdiqlash oynasi (native <dialog> + showModal): fokus tuzog'i, Esc yopadi. Qaytarib bo'lmaydigan amallar
 * («Kirim qilish», bekor qilish) oldidan — nima bo'lishini aniq aytadi.
 */
export default function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel,
  tone = 'primary',
  pending,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  tone?: 'primary' | 'accent' | 'danger';
  pending?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handle = () => onCloseRef.current();
    el.addEventListener('close', handle);
    return () => el.removeEventListener('close', handle);
  }, []);

  return (
    <dialog ref={ref} className="rc-dialog" aria-labelledby={titleId}>
      <h2 id={titleId} className="rc-dialog-title">{title}</h2>
      {children && <div className="rc-dialog-body">{children}</div>}
      <div className="rc-dialog-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose} disabled={pending}>{cancelLabel}</button>
        <button
          type="button"
          className={`btn ${tone === 'danger' ? 'btn-danger-fill' : tone === 'accent' ? 'btn-accent' : 'btn-primary'}`}
          onClick={onConfirm}
          disabled={pending}
          autoFocus
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}

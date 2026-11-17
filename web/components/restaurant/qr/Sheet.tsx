'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Pastdan chiquvchi oyna (native <dialog> + showModal): fokus tuzog'i, Esc va orqa fon bosilsa yopiladi.
 * Ochiq paytda sahifa aylanmaydi (html.qm-lock).
 */
export default function Sheet({
  open,
  onClose,
  labelledBy,
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      document.documentElement.classList.add('qm-lock');
    } else if (!open && el.open) {
      el.close();
    }
    if (!open) document.documentElement.classList.remove('qm-lock');
  }, [open]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Esc (cancel → close) yoki el.close() — ota holatini ham yopamiz
    const handle = () => {
      document.documentElement.classList.remove('qm-lock');
      onCloseRef.current();
    };
    el.addEventListener('close', handle);
    return () => {
      el.removeEventListener('close', handle);
      document.documentElement.classList.remove('qm-lock');
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className="qm-sheet"
      aria-labelledby={labelledBy}
      onClick={(e) => {
        // Orqa fon (::backdrop) bosilganda hodisa nishoni — dialogning o'zi
        if (e.target === ref.current) onClose();
      }}
    >
      {open ? children : null}
    </dialog>
  );
}

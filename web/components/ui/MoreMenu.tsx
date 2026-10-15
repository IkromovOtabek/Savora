'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

/**
 * "Ko'proq" (⋯) menyusi — kam ishlatiladigan va xavfli amallarni asosiy ko'rinishdan olib qo'yish uchun.
 * Ichiga <a>, <Link>, <form><button> qo'yiladi. Escape va tashqariga bosish yopadi.
 */
export default function MoreMenu({ children, label = 'Ko\'proq amallar' }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); } };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div className="ux-more" ref={box}>
      <button ref={btn} type="button" className="ux-more-btn" aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
      </button>
      {open && (
        <div className="ux-more-menu" role="menu" id={id} onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

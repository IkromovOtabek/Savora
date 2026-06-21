'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from '@/lib/toast';

interface Props {
  phone?: string;
  text: string;
}

/** Telefon raqamni xalqaro formatga keltiradi (O'zbekiston) */
function normalizePhone(raw?: string): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('998')) {
    /* ok */
  } else if (d.length === 9) {
    d = '998' + d;
  } else if (d.length === 12 && d.startsWith('998')) {
    /* ok */
  } else if (d.startsWith('8') && d.length === 10) {
    d = '99' + d;
  }
  return d.length >= 11 ? d : null;
}

export default function DebtReminderButton({ phone, text }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const num = normalizePhone(phone);
  const enc = encodeURIComponent(text);

  function toggle() {
    if (open) { setOpen(false); return; }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      const menuW = 190;
      const left = Math.min(r.right - menuW, window.innerWidth - menuW - 8);
      setPos({ top: r.bottom + 6, left: Math.max(8, left) });
    }
    setOpen(true);
  }

  // Tashqariga bosish / scroll / resize — yopish
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  return (
    <div className="dr-wrap">
      <button ref={btnRef} type="button" className="btn btn-ghost btn-sm" onClick={toggle}>
        🔔 Eslatma
      </button>
      {open && pos && (
        <div className="dr-menu" ref={menuRef} style={{ position: 'fixed', top: pos.top, left: pos.left }}>
          {num ? (
            <>
              <a className="dr-item" href={`https://wa.me/${num}?text=${enc}`} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
                WhatsApp orqali
              </a>
              <a className="dr-item" href={`https://t.me/+${num}`} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
                Telegram orqali
              </a>
              <a className="dr-item" href={`sms:+${num}?body=${enc}`} onClick={() => setOpen(false)}>
                SMS orqali
              </a>
            </>
          ) : (
            <div className="dr-empty">Telefon raqami yo&apos;q</div>
          )}
          <button
            type="button"
            className="dr-item"
            onClick={() => {
              navigator.clipboard?.writeText(text).then(
                () => toast('Matn nusxalandi', 'success'),
                () => toast('Nusxalab bo\'lmadi', 'error'),
              );
              setOpen(false);
            }}
          >
            Matnni nusxalash
          </button>
        </div>
      )}
    </div>
  );
}

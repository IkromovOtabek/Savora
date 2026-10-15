'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { toast } from '@/lib/toast';
import Icon from '@/components/icons/Icon';

interface Props {
  phone?: string;
  text: string;
  /** Muddati o'tgan / yaqin qarzlar uchun ko'zga tashlanadigan (to'ldirilgan) tugma */
  prominent?: boolean;
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

export default function DebtReminderButton({ phone, text, prominent }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const num = normalizePhone(phone);
  const enc = encodeURIComponent(text);

  function toggle() {
    if (open) { setOpen(false); return; }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      const menuW = 210;
      const menuH = 200;
      const left = Math.min(r.right - menuW, window.innerWidth - menuW - 8);
      // Pastda joy yetmasa — tugma ustida ochiladi
      const top = r.bottom + 6 + menuH > window.innerHeight ? Math.max(8, r.top - menuH - 6) : r.bottom + 6;
      setPos({ top, left: Math.max(8, left) });
    }
    setOpen(true);
  }

  // Tashqariga bosish / scroll / resize / Escape — yopish
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onScroll = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus(); }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    menuRef.current?.querySelector<HTMLElement>('a, button')?.focus();
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  return (
    <div className="dr-wrap cl-remind-wrap">
      <button
        ref={btnRef}
        type="button"
        className={`btn btn-sm btn-with-icon cl-remind${prominent ? ' cl-remind--hot' : ''}`}
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
      >
        <Icon name="bell" size={14} /> Eslatma
      </button>
      {open && pos && (
        <div id={menuId} role="menu" className="dr-menu cl-menu" ref={menuRef} style={{ position: 'fixed', top: pos.top, left: pos.left }}>
          {num ? (
            <>
              <a role="menuitem" className="dr-item cl-menu-item" href={`https://wa.me/${num}?text=${enc}`} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
                <Icon name="send" size={15} /> WhatsApp orqali
              </a>
              <a role="menuitem" className="dr-item cl-menu-item" href={`https://t.me/+${num}`} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
                <Icon name="send" size={15} /> Telegram orqali
              </a>
              <a role="menuitem" className="dr-item cl-menu-item" href={`sms:+${num}?body=${enc}`} onClick={() => setOpen(false)}>
                <Icon name="phone" size={15} /> SMS orqali
              </a>
            </>
          ) : (
            <div className="dr-empty cl-menu-empty">Telefon raqami yo&apos;q</div>
          )}
          <button
            type="button"
            role="menuitem"
            className="dr-item cl-menu-item"
            onClick={() => {
              navigator.clipboard?.writeText(text).then(
                () => toast('Matn nusxalandi', 'success'),
                () => toast('Nusxalab bo\'lmadi', 'error'),
              );
              setOpen(false);
            }}
          >
            <Icon name="clipboard" size={15} /> Matnni nusxalash
          </button>
        </div>
      )}
    </div>
  );
}

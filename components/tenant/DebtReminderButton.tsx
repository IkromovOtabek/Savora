'use client';

import { useState } from 'react';
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
  const num = normalizePhone(phone);
  const enc = encodeURIComponent(text);

  return (
    <div className="dr-wrap">
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen((v) => !v)}>
        🔔 Eslatma
      </button>
      {open && (
        <div className="dr-menu" onMouseLeave={() => setOpen(false)}>
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

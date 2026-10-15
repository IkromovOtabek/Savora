'use client';

import { useState, useTransition } from 'react';
import Icon from '@/components/icons/Icon';
import '@/components/tenant/styles/admin.css';
import { createTelegramLinkAction } from '@/app/actions/telegramLink';

/**
 * Shaxsiy Telegram Mini App ulash. Tugma bot deep-link (`/start lu_<code>`) ni
 * ochadi — bot Telegram hisobini joriy foydalanuvchiga bog'laydi. So'ng bot
 * ichidagi "Savora'ni ochish" tugmasi to'g'ridan-to'g'ri ilovaga kiritadi.
 */
export default function TelegramAppLink({ linked }: { linked: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  function connect() {
    setError('');
    start(async () => {
      const res = await createTelegramLinkAction();
      if (res.link) {
        setDone(true);
        window.open(res.link, '_blank', 'noopener,noreferrer');
      } else {
        setError(res.error || 'Xatolik.');
      }
    });
  }

  return (
    <div className="ad-tg">
      <div className="ad-cell">
        <span className="ad-sq ad-sq--tg" aria-hidden="true"><Icon name="send" size={16} /></span>
        <span className="ad-cell-t">
          <b>Telegram ilova (Mini App)</b>
          <small>
            {linked
              ? <>Hisobingiz bog&apos;langan — botdagi <b>«Savora&apos;ni ochish»</b> tugmasi bilan login/parolsiz kirasiz.</>
              : 'Telegram hisobingizni bog\'lang — do\'koningizni Telegram ichida login/parolsiz boshqarasiz.'}
          </small>
        </span>
        <span className="ad-cell-a">
          <span className={`ad-pill ${linked ? 'ad-pill--ok' : ''}`}>
            {linked && <Icon name="check" size={12} />}
            {linked ? 'Bog\'langan' : 'Bog\'lanmagan'}
          </span>
          <button
            type="button"
            onClick={connect}
            disabled={pending}
            className={`btn btn-sm ${linked ? 'btn-ghost' : 'btn-primary'}`}
          >
            {pending ? 'Tayyorlanmoqda…' : linked ? 'Qayta bog\'lash' : 'Bog\'lash'}
          </button>
        </span>
      </div>
      <div aria-live="polite">
        {done && !linked && (
          <div className="auth-alert ad-tg-note">
            Telegram ochildi — botda <b>Start / Ulash</b> tugmasini bosing, so&apos;ng bu sahifani yangilang.
          </div>
        )}
        {error && <div className="auth-alert auth-alert--error ad-tg-note" role="alert">{error}</div>}
      </div>
    </div>
  );
}

'use client';

import { useState, useTransition } from 'react';
import Icon from '@/components/icons/Icon';
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
    <div className="panel" style={{ marginTop: 20 }}>
      <div className="panel-head">
        <h2>Telegram ilova (Mini App)</h2>
      </div>
      <div className="detail-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {linked ? (
          <div className="auth-alert auth-alert--info" style={{ margin: 0 }}>
            ✅ Telegram hisobingiz bog&apos;langan. Botni ochib <b>“Savora’ni ochish”</b> tugmasi orqali ilovaga to&apos;g&apos;ridan-to&apos;g&apos;ri kirishingiz mumkin.
          </div>
        ) : (
          <p className="dash-sub" style={{ margin: 0 }}>
            Telegram hisobingizni bog&apos;lang — keyin do&apos;koningizni telefon yoki kompyuterdan
            to&apos;g&apos;ridan-to&apos;g&apos;ri Telegram ichida (login/parolsiz) boshqarasiz.
          </p>
        )}
        {done && !linked && (
          <div className="auth-alert" style={{ margin: 0 }}>
            Telegram ochildi — botda <b>Start / Ulash</b> tugmasini bosing, so&apos;ng bu sahifani yangilang.
          </div>
        )}
        {error && <div className="auth-alert auth-alert--error" style={{ margin: 0 }}>{error}</div>}
        <button
          type="button"
          onClick={connect}
          disabled={pending}
          className="btn btn-primary btn-with-icon"
          style={{ alignSelf: 'flex-start' }}
        >
          <Icon name="login" size={16} />
          {pending ? 'Tayyorlanmoqda…' : linked ? 'Qayta bog\'lash' : 'Telegram hisobini bog\'lash'}
        </button>
      </div>
    </div>
  );
}

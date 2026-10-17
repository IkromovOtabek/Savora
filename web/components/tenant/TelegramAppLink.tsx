'use client';

import { useState, useTransition } from 'react';
import Icon from '@/components/icons/Icon';
import '@/components/tenant/styles/admin.css';
import { createTelegramLinkAction } from '@/app/actions/telegramLink';
import { useDict } from '@/lib/i18n/client';

/**
 * Shaxsiy Telegram Mini App ulash. Tugma bot deep-link (`/start lu_<code>`) ni
 * ochadi — bot Telegram hisobini joriy foydalanuvchiga bog'laydi. So'ng bot
 * ichidagi "Savora'ni ochish" tugmasi to'g'ridan-to'g'ri ilovaga kiritadi.
 */
export default function TelegramAppLink({ linked }: { linked: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const d = useDict();
  const t = d.shell.telegram;

  function connect() {
    setError('');
    start(async () => {
      const res = await createTelegramLinkAction();
      if (res.link) {
        setDone(true);
        window.open(res.link, '_blank', 'noopener,noreferrer');
      } else {
        setError(res.error || d.common.error);
      }
    });
  }

  return (
    <div className="ad-tg">
      <div className="ad-cell">
        <span className="ad-sq ad-sq--tg" aria-hidden="true"><Icon name="send" size={16} /></span>
        <span className="ad-cell-t">
          <b>{t.appTitle}</b>
          <small>
            {linked
              ? <>{t.linkedBefore}<b>{t.openButton}</b>{t.linkedAfter}</>
              : t.notLinkedText}
          </small>
        </span>
        <span className="ad-cell-a">
          <span className={`ad-pill ${linked ? 'ad-pill--ok' : ''}`}>
            {linked && <Icon name="check" size={12} />}
            {linked ? t.linked : t.notLinked}
          </span>
          <button
            type="button"
            onClick={connect}
            disabled={pending}
            className={`btn btn-sm ${linked ? 'btn-ghost' : 'btn-primary'}`}
          >
            {pending ? t.preparing : linked ? t.relink : t.link}
          </button>
        </span>
      </div>
      <div aria-live="polite">
        {done && !linked && (
          <div className="auth-alert ad-tg-note">
            {t.openedBefore}<b>{t.startButton}</b>{t.openedAfter}
          </div>
        )}
        {error && <div className="auth-alert auth-alert--error ad-tg-note" role="alert">{error}</div>}
      </div>
    </div>
  );
}

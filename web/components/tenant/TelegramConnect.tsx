import Icon from '@/components/icons/Icon';
import '@/components/tenant/styles/admin.css';
import { createOrgLinkToken } from '@/lib/security';
import { getDict } from '@/lib/i18n/server';

interface Props {
  orgId: string;
  connected: boolean;
}

/**
 * Do'kon Telegram'ini ulash. Tugma bot bilan suhbatni ochib `/start link_<token>`
 * yuboradi (token = orgId + 1 soatlik muddat + HMAC imzo; faqat server yaratadi) —
 * webhook tokenni tekshirib telegramChatId ni saqlaydi. Shu chatga obuna eslatmalari
 * va parolni tiklash kodlari keladi.
 */
export default async function TelegramConnect({ orgId, connected }: Props) {
  // Username'ni tozalaymiz: @, bo'sh joy, to'liq URL (t.me/...) yozilgan bo'lsa ham ishlaydi
  const bot = (process.env.TELEGRAM_BOT_USERNAME || '')
    .trim()
    .replace(/^@/, '')
    .replace(/^https?:\/\/(t\.me|telegram\.me)\//i, '')
    .replace(/\/$/, '');
  if (!bot) return null;
  const t = (await getDict()).shell.telegram;

  const secret = process.env.SESSION_SECRET || 'dev-only-session-secret-change-in-prod-32ch';
  const link = `https://t.me/${bot}?start=link_${createOrgLinkToken(String(orgId), secret)}`;

  return (
    <div className="ad-tg">
      <div className="ad-cell">
        <span className="ad-sq ad-sq--tg" aria-hidden="true"><Icon name="bell" size={16} /></span>
        <span className="ad-cell-t">
          <b>{t.orgTitle}</b>
          <small>{connected ? t.orgConnected : t.orgNotConnected}</small>
        </span>
        <span className="ad-cell-a">
          <span className={`ad-pill ${connected ? 'ad-pill--ok' : ''}`}>
            {connected && <Icon name="check" size={12} />}
            {connected ? t.connected : t.notConnected}
          </span>
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className={`btn btn-sm ${connected ? 'btn-ghost' : 'btn-primary'}`}
          >
            {connected ? t.reconnect : t.connect}
          </a>
        </span>
      </div>
    </div>
  );
}

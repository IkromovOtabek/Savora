import Icon from '@/components/icons/Icon';
import { createOrgLinkToken } from '@/lib/security';

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
export default function TelegramConnect({ orgId, connected }: Props) {
  // Username'ni tozalaymiz: @, bo'sh joy, to'liq URL (t.me/...) yozilgan bo'lsa ham ishlaydi
  const bot = (process.env.TELEGRAM_BOT_USERNAME || '')
    .trim()
    .replace(/^@/, '')
    .replace(/^https?:\/\/(t\.me|telegram\.me)\//i, '')
    .replace(/\/$/, '');
  if (!bot) return null;

  const secret = process.env.SESSION_SECRET || 'dev-only-session-secret-change-in-prod-32ch';
  const link = `https://t.me/${bot}?start=link_${createOrgLinkToken(String(orgId), secret)}`;

  return (
    <div className="panel" style={{ marginTop: 20 }}>
      <div className="panel-head">
        <h2>Telegram</h2>
      </div>
      <div className="detail-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {connected ? (
          <div className="auth-alert auth-alert--info" style={{ margin: 0, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <Icon name="check" size={16} />
            <span>Telegram ulangan. Obuna eslatmalari va parolni tiklash kodlari shu yerga keladi.</span>
          </div>
        ) : (
          <p className="dash-sub" style={{ margin: 0 }}>
            Telegram&apos;ni ulang — parolni unutsangiz tiklash kodi shu yerga keladi, hamda obuna
            muddati eslatmalari keladi.
          </p>
        )}
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary btn-with-icon"
          style={{ alignSelf: 'flex-start' }}
        >
          <Icon name="bell" size={16} />
          {connected ? 'Qayta ulash' : 'Telegram ulash'}
        </a>
      </div>
    </div>
  );
}

import Icon from '@/components/icons/Icon';

interface Props {
  orgId: string;
  connected: boolean;
}

/**
 * Do'kon Telegram'ini ulash. Tugma bot bilan suhbatni ochib `/start link_<orgId>`
 * yuboradi — webhook telegramChatId ni saqlaydi. Shu chatga obuna eslatmalari
 * va parolni tiklash kodlari keladi.
 */
export default function TelegramConnect({ orgId, connected }: Props) {
  const bot = process.env.TELEGRAM_BOT_USERNAME;
  if (!bot) return null;

  const link = `https://t.me/${bot}?start=link_${orgId}`;

  return (
    <div className="panel" style={{ marginTop: 20 }}>
      <div className="panel-head">
        <h2>Telegram</h2>
      </div>
      <div className="detail-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {connected ? (
          <div className="auth-alert auth-alert--info" style={{ margin: 0 }}>
            ✅ Telegram ulangan. Obuna eslatmalari va parolni tiklash kodlari shu yerga keladi.
          </div>
        ) : (
          <p className="dash-sub" style={{ margin: 0 }}>
            Telegram&apos;ni ulang — parolni unutsangiz yangi parol shu yerga keladi, hamda obuna
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

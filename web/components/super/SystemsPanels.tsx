'use client';

import { useActionState } from 'react';
import { runExpireOrgsAction, runExpiryNotifyAction } from '@/app/actions/systems';
import Icon, { type IconName } from '@/components/icons/Icon';
import { Alert, Sq, type SqTone } from './ui';

const APP_BASE = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

function CronPanel({
  title,
  description,
  action,
  anchor,
  curl,
  icon,
  tone,
}: {
  title: string;
  description: string;
  action: typeof runExpireOrgsAction;
  anchor: string;
  curl: string;
  icon: IconName;
  tone: SqTone;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <section className="sa-card" id={anchor}>
      <div className="sa-card-h" style={{ alignItems: 'flex-start' }}>
        <div className="sa-subhead">
          <Sq icon={icon} tone={tone} />
          <div>
            <h3>{title}</h3>
            <p>{description}</p>
          </div>
        </div>
      </div>
      <div className="sa-card-b sa-fields">
        {state?.error && <Alert tone="error">{state.error}</Alert>}
        {state?.success && <Alert tone="ok">{state.success}</Alert>}
        <form action={formAction}>
          <button type="submit" className="sa-btn sa-btn--tinted" disabled={pending}>
            <Icon name="clock" size={16} />
            {pending ? 'Ishlanmoqda…' : 'Hozir ishga tushirish'}
          </button>
        </form>
        <details className="sa-details">
          <summary><Icon name="chevron" size={14} /> Cron / terminal buyrug&apos;i</summary>
          <pre>{curl}</pre>
        </details>
      </div>
    </section>
  );
}

function InfoGroup({ id, title, foot, rows }: { id: string; title: string; foot?: string; rows: React.ReactNode[] }) {
  return (
    <section className="sa-section" id={id}>
      <div className="sa-ghead">{title}</div>
      <div className="sa-group">
        {rows.map((r, i) => (
          <div key={i} className="sa-cell">
            <span className="sa-cell-t"><small className="sa-wrap" style={{ color: 'var(--ink-1)', fontSize: 14 }}>{r}</small></span>
          </div>
        ))}
      </div>
      {foot && <div className="sa-gfoot">{foot}</div>}
    </section>
  );
}

export default function SystemsPanels() {
  return (
    <div className="sa-stack">
      <div className="sa-two">
        <CronPanel
          anchor="notify"
          icon="bell"
          tone="a"
          title="Obuna eslatmalari"
          description="Obunaga 2 kun qolganda Super Admin, do'kon admini va xodimlarga panelda va Telegram'da xabar."
          action={runExpiryNotifyAction}
          curl={`curl -H "Authorization: Bearer $CRON_SECRET" ${APP_BASE}/api/cron/expiry-notifications\n# yoki: npm run notify`}
        />
        <CronPanel
          anchor="expire"
          icon="clock"
          tone="r"
          title="Obuna muddati (cron)"
          description="Muddati o'tgan faol do'konlarni avtomatik «muddati tugagan» holatiga o'tkazadi."
          action={runExpireOrgsAction}
          curl={`curl -H "Authorization: Bearer $CRON_SECRET" ${APP_BASE}/api/cron/expire-orgs\n# yoki: npm run expire`}
        />
      </div>

      <InfoGroup
        id="modules-savdo"
        title="Variant, kredit, kassa"
        foot="Har bir do'kon uchun Super Admin → Do'kon → Modullar bo'limidan yoqing."
        rows={[
          <><b>Variant</b> — sotuvda bo&apos;lib to&apos;lash (nasiya)</>,
          <><b>Kredit kassa</b> — do&apos;kon egasi bank qo&apos;shadi; sotuv va mahsulot holatida «Kredit»</>,
          <><b>Kassa</b> — kunlik tushum va kredit kassa hisoboti</>,
          <><b>Kirim-chiqim</b> — do&apos;kon egasi admin panelida kirim/chiqim jurnali</>,
        ]}
      />

      <InfoGroup
        id="export"
        title="CSV eksport"
        foot="Do'kon panelida tizimga kirilgan holda ishlaydi — Super Admin to'g'ridan-to'g'ri ocha olmaydi."
        rows={[
          <>Ombor CSV: do&apos;kon paneli → Ombor (eksport moduli yoqilgan bo&apos;lishi kerak)</>,
          <>API: <code className="sa-code">GET /api/export/products</code> — do&apos;kon sessiyasi talab qilinadi</>,
          <>Sotuvlar: <code className="sa-code">GET /api/export/sales</code></>,
        ]}
      />

      <InfoGroup
        id="telegram"
        title="Telegram bot"
        foot="Yangi sotuv va obuna eslatmalari. .env faylida TELEGRAM_BOT_TOKEN va TELEGRAM_CHAT_ID bo'lishi kerak."
        rows={[
          <>Webhook: <code className="sa-code">POST /api/telegram/webhook</code> (brauzerda GET ishlamaydi — bu normal)</>,
          <>Webhook <code className="sa-code">setWebhook</code> orqali <code className="sa-code">secret_token=TELEGRAM_WEBHOOK_SECRET</code> parametri bilan ulanadi (busiz production&apos;da so&apos;rovlar rad etiladi)</>,
        ]}
      />
    </div>
  );
}

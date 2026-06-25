'use client';

import { useActionState } from 'react';
import { runExpireOrgsAction, runExpiryNotifyAction } from '@/app/actions/systems';
import Icon from '@/components/icons/Icon';

const APP_BASE = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

function CronPanel({
  title,
  description,
  action,
  anchor,
  curl,
}: {
  title: string;
  description: string;
  action: typeof runExpireOrgsAction;
  anchor: string;
  curl: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <div className="panel system-panel" id={anchor}>
      <div className="panel-head">
        <h2>{title}</h2>
        <p className="panel-sub">{description}</p>
      </div>
      <div className="system-panel-body">
        {state?.error && <div className="auth-alert auth-alert--error">{state.error}</div>}
        {state?.success && <div className="auth-alert auth-alert--info">{state.success}</div>}
        <form action={formAction}>
          <button type="submit" className="btn btn-primary btn-with-icon" disabled={pending}>
            <Icon name="clock" size={16} />
            {pending ? 'Ishlanmoqda...' : 'Hozir ishga tushirish'}
          </button>
        </form>
        <details className="system-curl">
          <summary>Cron / terminal buyrug&apos;i</summary>
          <pre>{curl}</pre>
        </details>
      </div>
    </div>
  );
}

export default function SystemsPanels() {
  return (
    <div className="systems-stack">
      <CronPanel
        anchor="notify"
        title="Obuna eslatmalari"
        description="Obunaga 2 kun qolganda Super Admin, biznes admin va xodimlarga panelda + Telegram xabar."
        action={runExpiryNotifyAction}
        curl={`curl -H "Authorization: Bearer $CRON_SECRET" ${APP_BASE}/api/cron/expiry-notifications\n# yoki: npm run notify`}
      />
      <CronPanel
        anchor="expire"
        title="Obuna muddati (Cron)"
        description="Muddati o'tgan faol bizneslarni avtomatik expired qiladi."
        action={runExpireOrgsAction}
        curl={`curl -H "Authorization: Bearer $CRON_SECRET" ${APP_BASE}/api/cron/expire-orgs\n# yoki: npm run expire`}
      />

      <div className="panel system-panel" id="modules-savdo">
        <div className="panel-head">
          <h2>Variant, Kredit, Kassa</h2>
          <p className="panel-sub">Har bir biznes uchun Super Admin → Biznes → Modullar bo&apos;limidan yoqing</p>
        </div>
        <div className="system-panel-body">
          <ul className="system-list">
            <li><strong>Variant</strong> — sotuvda bo&apos;lib to&apos;lash (nasiya)</li>
            <li><strong>Kredit kassa</strong> — biznes egasi bank qo&apos;shadi; sotuv va mahsulot statusida &quot;Kredit&quot;</li>
            <li><strong>Kassa</strong> — kunlik tushum va kredit kassa hisoboti</li>
            <li><strong>Kirim-Chiqim</strong> — biznes egasi admin panelida kirim/chiqim jurnali</li>
          </ul>
        </div>
      </div>

      <div className="panel system-panel" id="export">
        <div className="panel-head">
          <h2>CSV export</h2>
          <p className="panel-sub">Do&apos;kon panelida login qilingan holda ishlaydi — Super Admin to&apos;g&apos;ridan-to&apos;g&apos;ri ochilmaydi.</p>
        </div>
        <div className="system-panel-body">
          <ul className="system-list">
            <li>Ombor CSV: do&apos;kon paneli → Ombor (export moduli yoqilgan bo&apos;lishi kerak)</li>
            <li>API: <code>GET /api/export/products</code> — tenant sessiya cookie talab qilinadi</li>
            <li>Sotuvlar: <code>GET /api/export/sales</code></li>
          </ul>
        </div>
      </div>

      <div className="panel system-panel" id="telegram">
        <div className="panel-head">
          <h2>Telegram bot</h2>
          <p className="panel-sub">Yangi sotuv va obuna eslatmalari. .env da TELEGRAM_BOT_TOKEN va TELEGRAM_CHAT_ID.</p>
        </div>
        <div className="system-panel-body">
          <ul className="system-list">
            <li>Webhook: <code>POST /api/telegram/webhook</code> (brauzerda GET ishlamaydi — bu normal)</li>
            <li>Telegram BotFather orqali webhook ulang</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useActionState } from 'react';
import { runExpireOrgsAction, runExpiryNotifyAction } from '@/app/actions/systems';
import Icon, { type IconName } from '@/components/icons/Icon';
import { useDict } from '@/lib/i18n/client';
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
  const d = useDict();

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
            {pending ? d.superPanel.systems.running : d.superPanel.systems.runNow}
          </button>
        </form>
        <details className="sa-details">
          <summary><Icon name="chevron" size={14} /> {d.superPanel.systems.cronCmd}</summary>
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
  const d = useDict();
  const s = d.superPanel.systems;

  return (
    <div className="sa-stack">
      <div className="sa-two">
        <CronPanel
          anchor="notify"
          icon="bell"
          tone="a"
          title={s.notifyTitle}
          description={s.notifyDesc}
          action={runExpiryNotifyAction}
          curl={`curl -H "Authorization: Bearer $CRON_SECRET" ${APP_BASE}/api/cron/expiry-notifications\n# yoki: npm run notify`}
        />
        <CronPanel
          anchor="expire"
          icon="clock"
          tone="r"
          title={s.expireTitle}
          description={s.expireDesc}
          action={runExpireOrgsAction}
          curl={`curl -H "Authorization: Bearer $CRON_SECRET" ${APP_BASE}/api/cron/expire-orgs\n# yoki: npm run expire`}
        />
      </div>

      <InfoGroup
        id="modules-savdo"
        title={s.modulesTitle}
        foot={s.modulesFoot}
        rows={[
          <><b>{s.modNasiya}</b> — {s.modNasiyaDesc}</>,
          <><b>{s.modCredit}</b> — {s.modCreditDesc}</>,
          <><b>{s.modKassa}</b> — {s.modKassaDesc}</>,
          <><b>{s.modKirim}</b> — {s.modKirimDesc}</>,
        ]}
      />

      <InfoGroup
        id="export"
        title={s.exportTitle}
        foot={s.exportFoot}
        rows={[
          <>{s.exportProducts}</>,
          <>{s.exportApi} <code className="sa-code">GET /api/export/products</code> {s.exportApiNote}</>,
          <>{s.exportSales} <code className="sa-code">GET /api/export/sales</code></>,
        ]}
      />

      <InfoGroup
        id="telegram"
        title={s.telegramTitle}
        foot={s.telegramFoot}
        rows={[
          <>{s.webhook} <code className="sa-code">POST /api/telegram/webhook</code> {s.webhookNote}</>,
          <>{s.webhookSecret1} <code className="sa-code">setWebhook</code> {s.webhookSecret2} <code className="sa-code">secret_token=TELEGRAM_WEBHOOK_SECRET</code> {s.webhookSecret3}</>,
        ]}
      />
    </div>
  );
}

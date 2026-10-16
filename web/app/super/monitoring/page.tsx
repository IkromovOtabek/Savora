import { requireSuperAdmin } from '@/lib/auth';
import { collectMonitoring } from '@/lib/systemMonitor';
import { PageTitle } from '@/components/super/ui';
import MonitoringRefresh from '@/components/super/MonitoringRefresh';
import {
  OverallPanel, SectionNav, ServerPanel, DbPanel, DiskPanel, AuditPanel, EventsPanel, ErrorsPanel, CronPanel, IntegrationsPanel, TenantsPanel,
} from '@/components/super/MonitoringPanels';

export const metadata = { title: 'Monitoring — Super Admin' };
export const dynamic = 'force-dynamic';

/**
 * Super Admin → Monitoring: server, baza, disk/zaxira, xavfsizlik auditi va hodisalari,
 * xatolar jurnali, cron, integratsiyalar, do'kon bazalari. Hamma narsa server tomonida
 * yig'iladi (lib/systemMonitor.ts); sirlar sahifaga chiqmaydi.
 */
export default async function SuperMonitoringPage() {
  await requireSuperAdmin();
  const s = await collectMonitoring();

  return (
    <>
      <PageTitle
        title="Monitoring"
        sub="Server, baza, xavfsizlik va cron holati — IT mutaxassis uchun bir sahifa"
        actions={<MonitoringRefresh generatedAt={s.generatedAt.toISOString()} />}
      />
      <OverallPanel s={s} />
      <SectionNav />
      <ServerPanel proc={s.process} os={s.os} />
      <DbPanel db={s.db} />
      <DiskPanel disk={s.disk} backup={s.backup} />
      <AuditPanel checks={s.posture} summary={s.postureSummary} />
      <EventsPanel sec={s.security} />
      <ErrorsPanel logs={s.logs} />
      <CronPanel cron={s.cron} />
      <IntegrationsPanel integrations={s.integrations} telegram={s.telegram} />
      <TenantsPanel tenants={s.tenants} />
    </>
  );
}

import { notFound } from 'next/navigation';
import { getMasterModels } from '@/lib/masterDb';
import { explainOrgFeatures, resolveOrgFeatures } from '@/lib/features';
import { isBusinessType } from '@/lib/businessTypes';
import { resolveOrgPlan, fmtPlanPrice } from '@/lib/plans';
import { getOrgAdminCredentials, getOrgDisplayStatus } from '@/lib/organizations';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';
import OrgEditForm from '@/components/super/OrgEditForm';
import OrgModulesForm from '@/components/super/OrgModulesForm';
import OrgLinksPanel from '@/components/super/OrgLinksPanel';
import OrgTenantSummary from '@/components/super/OrgTenantSummary';
import OrgTabs from '@/components/super/OrgTabs';
import Icon, { type IconName } from '@/components/icons/Icon';
import OrgPermissionsMatrix from '@/components/super/OrgPermissionsMatrix';
import { Alert, OrgStatusPill, PageTitle } from '@/components/super/ui';
import { daysUntilExpiry } from '@/lib/models/master/Organization';

/** Tab ichidagi karta: rangli ikonka, sarlavha, izoh */
function Panel({ title, sub, icon, iconBg, children }: { title: string; sub: string; icon: IconName; iconBg: string; children: React.ReactNode }) {
  return (
    <section className="sa-card sa-panel">
      <div className="sa-panel-h">
        <span className="sa-sq sa-sq--lg" style={{ background: iconBg }} aria-hidden="true">
          <Icon name={icon} size={19} strokeWidth={2.2} />
        </span>
        <span className="sa-collapse-text">
          <b>{title}</b>
          <small>{sub}</small>
        </span>
      </div>
      <div className="sa-collapse-body">{children}</div>
    </section>
  );
}

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.superPanel.org.metaTitle };
}

export default async function OrgDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const d = await getDict();
  const s = d.superPanel;
  const t = s.org;
  const { Organization } = await getMasterModels();
  const org = await Organization.findById(id).lean();
  if (!org) notFound();

  const expiresValue = new Date(org.expiresAt).toISOString().slice(0, 10);
  const features = resolveOrgFeatures(org);
  const featureExplain = explainOrgFeatures(org);
  const typeLabel = d.catalog.businessTypes[isBusinessType(org.businessType) ? org.businessType : 'general'].label;
  const plan = resolveOrgPlan(org);
  const credentials = await getOrgAdminCredentials(org);
  const status = getOrgDisplayStatus(org);
  const daysLeft = daysUntilExpiry(org);

  return (
    <>
      <PageTitle
        back={{ href: '/super', label: s.orgs.title }}
        title={org.name}
        sub={<>{typeLabel} · {org.slug}</>}
        actions={<OrgStatusPill status={{ key: status.key, label: s.status[status.key] }} />}
      />

      {/* Asosiy faktlar — bir qarashda: tarif, to'lov, muddat, limitlar */}
      <dl className="sa-facts">
        <div><dt>{t.plan}</dt><dd>{d.catalog.planTiers[plan.tier]}</dd></div>
        <div><dt>{t.monthlyPayment}</dt><dd>{fmtPlanPrice(plan.monthlyPayment, { free: s.free, sum: d.common.sum })}</dd></div>
        <div className={daysLeft < 0 ? 'is-bad' : daysLeft <= 7 ? 'is-warn' : undefined}>
          <dt>{t.subscriptionUntil}</dt>
          <dd>{new Date(org.expiresAt).toLocaleDateString('uz-UZ')}</dd>
          <small>{daysLeft < 0 ? tr(s.expiredDaysAgo, { n: -daysLeft }) : daysLeft === 0 ? s.todayEnds : tr(s.nDaysLeft, { n: daysLeft })}</small>
        </div>
        <div><dt>{t.branchLimit}</dt><dd>{plan.maxFilial}</dd></div>
        <div><dt>{t.userLimit}</dt><dd>{plan.maxUsers}</dd></div>
      </dl>

      {sp?.created === '1' && (
        <Alert tone="ok">{t.created}</Alert>
      )}

      <OrgTabs
        defaultId={sp?.created === '1' ? 'havolalar' : 'sozlamalar'}
        tabs={[
          {
            id: 'sozlamalar',
            label: t.tabSettings,
            icon: 'settings',
            content: (
              <Panel title={t.settingsTitle} sub={t.settingsSub} icon="settings" iconBg="#8a93a8">
                <OrgEditForm
                  orgId={String(org._id)}
                  initial={{
                    name: org.name,
                    ownerName: org.ownerName ?? '',
                    phone: org.phone ?? '',
                    status: org.status,
                    planTier: org.plan.tier,
                    businessType: org.businessType ?? 'general',
                    expiresAt: expiresValue,
                    slug: org.slug,
                    dbName: org.dbName,
                    maxFilial: org.plan.maxFilial,
                    maxUsers: org.plan.maxUsers,
                    monthlyPayment: org.plan.monthlyPayment ?? plan.monthlyPayment,
                    agreementNote: org.plan.agreementNote ?? '',
                    adminUsername: credentials.username,
                    // Xesh brauzerga yuborilmaydi — faqat o'rnatilganmi yoki yo'qligi
                    passwordHash: credentials.passwordHash ? 'set' : '',
                  }}
                />
              </Panel>
            ),
          },
          {
            id: 'modullar',
            label: t.tabModules,
            icon: 'grid',
            content: (
              <Panel title={t.tabModules} sub={t.modulesSub} icon="grid" iconBg="#1a8a52">
                <OrgModulesForm
                  orgId={String(org._id)}
                  explain={featureExplain}
                  businessType={org.businessType ?? 'general'}
                  planTier={plan.tier}
                />
              </Panel>
            ),
          },
          {
            id: 'huquqlar',
            label: t.tabPerms,
            icon: 'key',
            content: (
              <Panel title={t.tabPerms} sub={t.permsSub} icon="key" iconBg="#d69a17">
                <OrgPermissionsMatrix orgId={String(org._id)} dbName={org.dbName} features={features} />
              </Panel>
            ),
          },
          {
            id: 'havolalar',
            label: t.tabLinks,
            icon: 'globe',
            content: (
              <Panel title={t.tabLinks} sub={`${org.name} · ${typeLabel}`} icon="globe" iconBg="#1a5fe0">
                <OrgLinksPanel org={org} />
              </Panel>
            ),
          },
          {
            id: 'jamoa',
            label: t.tabTeam,
            icon: 'users',
            content: (
              <Panel title={t.teamTitle} sub={t.viewOnly} icon="users" iconBg="#1287a8">
                <OrgTenantSummary dbName={org.dbName} />
              </Panel>
            ),
          },
        ]}
      />
    </>
  );
}

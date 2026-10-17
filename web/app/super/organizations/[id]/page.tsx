import { notFound } from 'next/navigation';
import { requireSuperAdmin } from '@/lib/auth';
import { getMasterModels } from '@/lib/masterDb';
import { explainOrgFeatures, resolveOrgFeatures } from '@/lib/features';
import { BUSINESS_TYPES } from '@/lib/businessTypes';
import { resolveOrgPlan, fmtPlanPrice } from '@/lib/plans';
import { getOrgAdminCredentials, getOrgDisplayStatus } from '@/lib/organizations';
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

export const metadata = { title: "Do'kon boshqaruvi — Super Admin" };

export default async function OrgDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  // Layout xavfsizlik chegarasi emas (soft-navigatsiyada qayta render bo'lmaydi) — sahifa o'zi tekshiradi
  await requireSuperAdmin();
  const { Organization } = await getMasterModels();
  const org = await Organization.findById(id).lean();
  if (!org) notFound();

  const expiresValue = new Date(org.expiresAt).toISOString().slice(0, 10);
  const features = resolveOrgFeatures(org);
  const featureExplain = explainOrgFeatures(org);
  const typeLabel = BUSINESS_TYPES[org.businessType as keyof typeof BUSINESS_TYPES]?.label ?? 'Umumiy savdo';
  const plan = resolveOrgPlan(org);
  const credentials = await getOrgAdminCredentials(org);
  const status = getOrgDisplayStatus(org);
  const daysLeft = daysUntilExpiry(org);

  return (
    <>
      <PageTitle
        back={{ href: '/super', label: "Do'konlar" }}
        title={org.name}
        sub={<>{typeLabel} · {org.slug}</>}
        actions={<OrgStatusPill status={status} />}
      />

      {/* Asosiy faktlar — bir qarashda: tarif, to'lov, muddat, limitlar */}
      <dl className="sa-facts">
        <div><dt>Tarif</dt><dd>{plan.label}</dd></div>
        <div><dt>Oylik to&apos;lov</dt><dd>{fmtPlanPrice(plan.monthlyPayment)}</dd></div>
        <div className={daysLeft < 0 ? 'is-bad' : daysLeft <= 7 ? 'is-warn' : undefined}>
          <dt>Obuna muddati</dt>
          <dd>{new Date(org.expiresAt).toLocaleDateString('uz-UZ')}</dd>
          <small>{daysLeft < 0 ? `${-daysLeft} kun oldin tugagan` : daysLeft === 0 ? 'Bugun tugaydi' : `${daysLeft} kun qoldi`}</small>
        </div>
        <div><dt>Filial limiti</dt><dd>{plan.maxFilial}</dd></div>
        <div><dt>Xodim limiti</dt><dd>{plan.maxUsers}</dd></div>
      </dl>

      {sp?.created === '1' && (
        <Alert tone="ok">Do&apos;kon yaratildi. Modullarni yoqing va «Havolalar» bo&apos;limidagi havolalarni mijozga bering.</Alert>
      )}

      <OrgTabs
        defaultId={sp?.created === '1' ? 'havolalar' : 'sozlamalar'}
        tabs={[
          {
            id: 'sozlamalar',
            label: 'Sozlamalar',
            icon: 'settings',
            content: (
              <Panel title="Do'kon sozlamalari" sub="Nomi, tarif, holat va obuna muddati" icon="settings" iconBg="#8a93a8">
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
            label: 'Modullar',
            icon: 'grid',
            content: (
              <Panel title="Modullar" sub="Tarif → biznes turi preseti → qo'lda o'zgartirish" icon="grid" iconBg="#1a8a52">
                <OrgModulesForm
                  orgId={String(org._id)}
                  explain={featureExplain}
                  businessType={org.businessType ?? 'general'}
                  planTier={org.plan.tier}
                />
              </Panel>
            ),
          },
          {
            id: 'huquqlar',
            label: 'Huquqlar',
            icon: 'key',
            content: (
              <Panel title="Huquqlar" sub="Loginlar bo'yicha ruxsatlar (filial loginlari)" icon="key" iconBg="#d69a17">
                <OrgPermissionsMatrix orgId={String(org._id)} dbName={org.dbName} features={features} />
              </Panel>
            ),
          },
          {
            id: 'havolalar',
            label: 'Havolalar',
            icon: 'globe',
            content: (
              <Panel title="Havolalar" sub={`${org.name} · ${typeLabel}`} icon="globe" iconBg="#1f4fa8">
                <OrgLinksPanel org={org} />
              </Panel>
            ),
          },
          {
            id: 'jamoa',
            label: 'Xodimlar',
            icon: 'users',
            content: (
              <Panel title="Xodimlar va filiallar" sub="Faqat ko'rish" icon="users" iconBg="#1287a8">
                <OrgTenantSummary dbName={org.dbName} />
              </Panel>
            ),
          },
        ]}
      />
    </>
  );
}

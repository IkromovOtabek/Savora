import { notFound } from 'next/navigation';
import { getMasterModels } from '@/lib/masterDb';
import { explainOrgFeatures, resolveOrgFeatures } from '@/lib/features';
import { BUSINESS_TYPES } from '@/lib/businessTypes';
import { resolveOrgPlan, fmtPlanPrice } from '@/lib/plans';
import { getOrgAdminCredentials, getOrgDisplayStatus } from '@/lib/organizations';
import OrgEditForm from '@/components/super/OrgEditForm';
import OrgModulesForm from '@/components/super/OrgModulesForm';
import OrgLinksPanel from '@/components/super/OrgLinksPanel';
import OrgTenantSummary from '@/components/super/OrgTenantSummary';
import CollapsibleCard from '@/components/super/CollapsibleCard';
import OrgPermissionsMatrix from '@/components/super/OrgPermissionsMatrix';
import { Alert, OrgStatusPill, PageTitle } from '@/components/super/ui';

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

  return (
    <>
      <PageTitle
        back={{ href: '/super', label: "Do'konlar" }}
        title={org.name}
        sub={
          <>
            {typeLabel} · {plan.label} · {fmtPlanPrice(plan.monthlyPayment)}{plan.monthlyPayment > 0 ? '/oy' : ''} · {plan.maxFilial} filial · {plan.maxUsers} xodim
          </>
        }
        actions={<OrgStatusPill status={status} />}
      />

      {sp?.created === '1' && (
        <Alert tone="ok">Do&apos;kon yaratildi. Modullarni yoqing va o&apos;ngdagi havolalarni mijozga bering.</Alert>
      )}

      <div className="sa-org-layout">
        <div className="sa-stack">
          <CollapsibleCard title="Do'kon sozlamalari" sub="Nomi, tarif, holat va obuna muddati" icon="settings" iconBg="#8a93a8">
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
          </CollapsibleCard>

          <CollapsibleCard title="Modullar" sub="Tarif → biznes turi preseti → qo'lda o'zgartirish" icon="grid" iconBg="#1a8a52">
            <OrgModulesForm
              orgId={String(org._id)}
              explain={featureExplain}
              businessType={org.businessType ?? 'general'}
              planLabel={plan.label}
            />
          </CollapsibleCard>

          <CollapsibleCard title="Huquqlar" sub="Loginlar bo'yicha ruxsatlar (filial loginlari)" icon="key" iconBg="#d69a17" defaultOpen={false}>
            <OrgPermissionsMatrix orgId={String(org._id)} dbName={org.dbName} features={features} />
          </CollapsibleCard>

          <CollapsibleCard title="Xodimlar va filiallar" sub="Faqat ko'rish" icon="users" iconBg="#1287a8" defaultOpen={false}>
            <OrgTenantSummary dbName={org.dbName} />
          </CollapsibleCard>
        </div>

        <div className="sa-org-aside">
          <CollapsibleCard title="Havolalar" sub={`${org.name} · ${typeLabel}`} icon="globe" iconBg="#1f4fa8">
            <OrgLinksPanel org={org} />
          </CollapsibleCard>
        </div>
      </div>
    </>
  );
}

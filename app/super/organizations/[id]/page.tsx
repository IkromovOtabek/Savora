import { notFound } from 'next/navigation';
import Link from 'next/link';
import BackLink from '@/components/ui/BackLink';
import { getMasterModels } from '@/lib/masterDb';
import { resolveOrgFeatures } from '@/lib/features';
import { BUSINESS_TYPES } from '@/lib/businessTypes';
import { resolveOrgPlan, fmtPlanPrice } from '@/lib/plans';
import { getOrgAdminCredentials } from '@/lib/organizations';
import OrgEditForm from '@/components/super/OrgEditForm';
import OrgModulesForm from '@/components/super/OrgModulesForm';
import OrgLinksPanel from '@/components/super/OrgLinksPanel';
import OrgTenantSummary from '@/components/super/OrgTenantSummary';
import CollapsibleCard from '@/components/super/CollapsibleCard';

export const metadata = { title: 'Biznes boshqaruvi — Savora' };

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
  const typeLabel = BUSINESS_TYPES[org.businessType as keyof typeof BUSINESS_TYPES]?.label ?? 'Umumiy savdo';
  const plan = resolveOrgPlan(org);
  const credentials = await getOrgAdminCredentials(org);

  return (
    <>
      <div className="super-page-head">
        <div>
          <BackLink href="/super">Bizneslar</BackLink>
          <h1>{org.name}</h1>
          <p>{typeLabel} · {plan.label} · {fmtPlanPrice(plan.monthlyPayment)} so&apos;m/oy · {plan.maxFilial} filial · {plan.maxUsers} xodim</p>
        </div>
      </div>

      {sp?.created === '1' && (
        <div className="auth-alert auth-alert--info" style={{ marginBottom: 20 }}>
          Biznes yaratildi. Modullarni yoqing va o&apos;ngdagi havolalarni clientga bering.
        </div>
      )}

      <div className="super-org-layout">
        <div className="super-org-main">
          <CollapsibleCard title="Biznes sozlamalari" icon="settings" iconBg="linear-gradient(135deg,#6366f1,#8b5cf6)">
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
                passwordHash: credentials.passwordHash,
              }}
            />
          </CollapsibleCard>

          <CollapsibleCard title="Xodimlar va filiallar" icon="users" iconBg="linear-gradient(135deg,#0ea5e9,#6366f1)" defaultOpen={false}>
            <OrgTenantSummary dbName={org.dbName} />
          </CollapsibleCard>

          <CollapsibleCard title="Modullar" sub="Qaysi bo'limlar ochiq — belgilang va saqlang" icon="grid" iconBg="linear-gradient(135deg,#10b981,#059669)">
            <OrgModulesForm orgId={String(org._id)} initial={features} businessType={org.businessType ?? 'general'} />
          </CollapsibleCard>
        </div>

        <CollapsibleCard title="Localhost havolalar" sub={`${org.name} · ${typeLabel}`} icon="globe" iconBg="linear-gradient(135deg,#0ea5e9,#6366f1)">
          <OrgLinksPanel org={org} />
        </CollapsibleCard>
      </div>
    </>
  );
}

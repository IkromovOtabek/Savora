import { NextResponse } from 'next/server';
import { verifyMobileToken } from '@/lib/mobileAuth';
import { loadUserPermissions } from '@/lib/permissionGuard';
import { getMasterModels } from '@/lib/masterDb';
import { resolveOrgFeatures } from '@/lib/features';
import { isOrganizationActive, daysUntilExpiry } from '@/lib/models/master/Organization';
import { termsFor, BUSINESS_TYPES } from '@/lib/businessTypes';

export async function GET(req: Request) {
  const user = await verifyMobileToken(req);
  if (!user || !user.organizationId) {
    return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  }
  const { Organization } = await getMasterModels();
  const org = await Organization.findById(user.organizationId).lean();
  if (!org) return NextResponse.json({ error: 'Do\'kon topilmadi.' }, { status: 404 });

  return NextResponse.json({
    user: { id: user.id, username: user.username, role: user.role, isAdmin: user.role === 'admin' },
    org: {
      name: org.name,
      slug: org.slug,
      active: isOrganizationActive(org),
      daysLeft: daysUntilExpiry(org),
      isTrial: !!org.plan?.isTrial,
      businessType: org.businessType ?? 'general',
      businessTypeLabel: BUSINESS_TYPES[org.businessType ?? 'general']?.label ?? 'Umumiy savdo',
    },
    // Biznes turiga qarab atamalar (mahsulot/menyu/dori ...)
    terms: termsFor(org.businessType),
    features: resolveOrgFeatures(org),
    // Xodim huquqlari (lib/permissions.ts) — ilova tugmalarni yashirishi uchun
    permissions: [...(await loadUserPermissions(user))],
  });
}

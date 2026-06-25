import { NextResponse } from 'next/server';
import { verifyMobileToken } from '@/lib/mobileAuth';
import { getMasterModels } from '@/lib/masterDb';
import { resolveOrgFeatures } from '@/lib/features';
import { isOrganizationActive, daysUntilExpiry } from '@/lib/models/master/Organization';

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
    },
    features: resolveOrgFeatures(org),
  });
}

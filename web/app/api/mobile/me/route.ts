import { NextResponse } from 'next/server';
import { authenticateMobile } from '@/lib/mobileAuth';
import { loadUserPermissions } from '@/lib/permissionGuard';
import { getMasterModels } from '@/lib/masterDb';
import { resolveOrgFeatures } from '@/lib/features';
import { isOrganizationActive, daysUntilExpiry } from '@/lib/models/master/Organization';
import { termsFor, productFieldsFor, BUSINESS_TYPES, PRODUCT_UNITS } from '@/lib/businessTypes';
import { getTenantModels } from '@/lib/tenantDb';

export async function GET(req: Request) {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth;
  if (!user || !user.organizationId) {
    return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  }
  const { Organization } = await getMasterModels();
  const org = await Organization.findById(user.organizationId).lean();
  if (!org) return NextResponse.json({ error: 'Do\'kon topilmadi.' }, { status: 404 });

  // Yangi mahsulot qaysi omborga tushadi (mobil POST /products bilan bir xil: o'z filiali yoki asosiy)
  let stockBranch: { id: string; name: string } | null = null;
  if (user.dbName) {
    const { Branch } = await getTenantModels(user.dbName);
    const b = user.branchId
      ? await Branch.findById(user.branchId, { name: 1 }).lean()
      : (await Branch.findOne({ isMain: true }, { name: 1 }).lean()) ?? (await Branch.findOne({}, { name: 1 }).lean());
    if (b) stockBranch = { id: String(b._id), name: b.name };
  }

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
    // Mahsulot formasining yo'nalishga xos maydonlari (yorliqlar ilova lug'atida)
    productFields: productFieldsFor(org.businessType),
    productUnits: PRODUCT_UNITS,
    stockBranch,
    features: resolveOrgFeatures(org),
    // Xodim huquqlari (lib/permissions.ts) — ilova tugmalarni yashirishi uchun
    permissions: [...(await loadUserPermissions(user))],
  });
}

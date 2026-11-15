import { NextResponse } from 'next/server';
import { getMasterModels } from './masterDb';
import { resolveOrgFeatures, OrgFeatures } from './features';
import { mobilePermissionDenied } from './permissionGuard';
import type { SessionUser } from './session';

/** Kirim-chiqim (mobil) — faqat biznes egasi (admin), modul yoqilgan va huquq berilgan bo'lsa (web bilan bir xil) */
export async function kirimChiqimDenied(user: SessionUser): Promise<NextResponse | null> {
  if (user.role !== 'admin') {
    return NextResponse.json({ error: 'Faqat biznes egasi uchun.' }, { status: 403 });
  }
  const features = await getMobileFeatures(user.organizationId);
  if (!features?.kirimChiqim) {
    return NextResponse.json({ error: 'Kirim-chiqim moduli yoqilmagan.' }, { status: 403 });
  }
  return mobilePermissionDenied(user, 'kirimChiqim.manage');
}

/** Mobil endpointlar uchun: foydalanuvchi do'konining yoqilgan modullari (features). */
export async function getMobileFeatures(organizationId?: string): Promise<OrgFeatures | null> {
  if (!organizationId) return null;
  const { Organization } = await getMasterModels();
  const org = await Organization.findById(organizationId).lean();
  return org ? resolveOrgFeatures(org) : null;
}

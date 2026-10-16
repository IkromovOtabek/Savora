import { NextResponse } from 'next/server';
import { authenticateMobile } from '@/lib/mobileAuth';
import { getMasterModels } from '@/lib/masterDb';
import { recordAudit } from '@/lib/audit';
import { parseBusinessType, BUSINESS_TYPES, termsFor } from '@/lib/businessTypes';

/** GET — mavjud biznes turlari ro'yxati (tanlash uchun). */
export async function GET(req: Request) {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth;
  // Faqat tenant foydalanuvchisi (super_admin'da do'kon konteksti yo'q)
  if (!user || !user.dbName || !user.organizationId) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  return NextResponse.json({
    types: (Object.keys(BUSINESS_TYPES) as (keyof typeof BUSINESS_TYPES)[]).map((key) => ({
      key,
      label: BUSINESS_TYPES[key].label,
      description: BUSINESS_TYPES[key].description,
    })),
  });
}

/** PATCH — biznes yo'nalishini o'zgartirish. Faqat biznes egasi (admin). */
export async function PATCH(req: Request) {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth;
  // Tenant konteksti shart — super_admin yoki dbName'siz token bu yerga kirmaydi
  if (!user || !user.organizationId || !user.dbName || user.role === 'super_admin') {
    return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  }
  if (user.role !== 'admin') {
    return NextResponse.json({ error: 'Bu amalni faqat biznes egasi bajara oladi.' }, { status: 403 });
  }
  let body: { businessType?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Noto\'g\'ri so\'rov.' }, { status: 400 }); }

  const bt = parseBusinessType(String(body.businessType || ''));
  const { Organization } = await getMasterModels();
  await Organization.updateOne({ _id: user.organizationId }, { $set: { businessType: bt, updatedAt: new Date() } });
  // AuditEntity'da 'org' yo'q — do'kon sozlamasi egasi (user) nomidan yoziladi
  await recordAudit(user, {
    action: 'org.businessType',
    entity: 'user',
    entityId: user.organizationId,
    summary: `Biznes yo'nalishi o'zgartirildi: ${BUSINESS_TYPES[bt].label} (mobil)`,
    meta: { businessType: bt },
  });

  return NextResponse.json({
    businessType: bt,
    businessTypeLabel: BUSINESS_TYPES[bt].label,
    terms: termsFor(bt),
  });
}

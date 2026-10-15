import { NextResponse } from 'next/server';
import { authenticateMobile } from '@/lib/mobileAuth';
import { getMasterModels } from '@/lib/masterDb';
import { parseBusinessType, BUSINESS_TYPES, termsFor } from '@/lib/businessTypes';

/** GET — mavjud biznes turlari ro'yxati (tanlash uchun). */
export async function GET(req: Request) {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth;
  if (!user) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
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
  if (!user || !user.organizationId) {
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

  return NextResponse.json({
    businessType: bt,
    businessTypeLabel: BUSINESS_TYPES[bt].label,
    terms: termsFor(bt),
  });
}

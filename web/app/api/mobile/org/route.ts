import { NextResponse } from 'next/server';
import { authenticateMobile } from '@/lib/mobileAuth';
import { getMasterModels } from '@/lib/masterDb';
import { recordAudit } from '@/lib/audit';
import { parseBusinessType, parseIndustryProfile, BUSINESS_TYPES, INDUSTRY_PROFILES, termsFor } from '@/lib/businessTypes';
import { getDictionary } from '@/lib/i18n/dict';
import { diffFeatureOverrides, resolveOrgFeatures } from '@/lib/features';
import { typeProductSetup } from '@/lib/orgUpdate';

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
    /** Ishlab chiqarish sexi kichik yo'nalishlari (faqat businessType = 'manufacturing' bilan PATCH'da yuboriladi) */
    profiles: INDUSTRY_PROFILES.map((key) => ({ key, ...getDictionary('uz').catalog.industryProfiles[key] })),
  });
}

/** PATCH — biznes yo'nalishini o'zgartirish: { businessType, industryProfile? }. Faqat biznes egasi (admin). */
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
  let body: { businessType?: string; industryProfile?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Noto\'g\'ri so\'rov.' }, { status: 400 }); }

  const bt = parseBusinessType(String(body.businessType || ''));
  // Sex kichik yo'nalishi: faqat manufacturing turida saqlanadi, boshqa turda tozalanadi;
  // so'rovda kalit bo'lmasa (eski ilova) va tur manufacturing bo'lsa — o'zgarmaydi
  const profile = parseIndustryProfile(body.industryProfile, bt);
  const touchProfile = 'industryProfile' in body || bt !== 'manufacturing';
  const profileSet = touchProfile && profile ? { industryProfile: profile } : {};
  const profileUnset = touchProfile && !profile ? { industryProfile: 1 } : {};
  const { Organization } = await getMasterModels();
  const org = await Organization.findById(user.organizationId).select('plan features businessType onboardingAnswers').lean();
  if (!org) return NextResponse.json({ error: 'Do\'kon topilmadi.' }, { status: 404 });
  // Modullar — Super Admin ixtiyorida: yo'nalish o'zgarsa ham amaldagi modullar o'zgarmaydi
  // (aks holda yangi preset Super Admin o'chirib qo'ygan modulni qayta yoqib yuborardi).
  // Faqat atamalar va mahsulot maydonlari almashadi — override'lar yangi bazaga nisbatan qayta hisoblanadi.
  const keep = diffFeatureOverrides({ plan: org.plan, businessType: bt }, resolveOrgFeatures(org));
  // Tur o'zgarsa — mahsulot maydonlari va birliklar yangi tur bo'yicha (ro'yxatdan o'tish ustasi qo'shimchalari; lib/orgUpdate.ts)
  const fields: Record<string, unknown> = {};
  const fieldsUnset: Record<string, 1> = {};
  if (bt !== org.businessType) {
    for (const [k, v] of Object.entries(typeProductSetup(org, bt))) {
      if (v) fields[k] = v;
      else fieldsUnset[k] = 1;
    }
  }
  const unset = { ...profileUnset, ...fieldsUnset };
  await Organization.updateOne(
    { _id: user.organizationId },
    Object.keys(keep).length
      ? { $set: { businessType: bt, features: keep, updatedAt: new Date(), ...profileSet, ...fields }, ...(Object.keys(unset).length ? { $unset: unset } : {}) }
      : { $set: { businessType: bt, updatedAt: new Date(), ...profileSet, ...fields }, $unset: { features: 1, ...unset } },
  );
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
    industryProfile: touchProfile ? profile : undefined,
    terms: termsFor(bt),
  });
}

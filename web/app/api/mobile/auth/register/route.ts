import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createOrganization } from '@/lib/organizations';
import { normalizeSlug } from '@/lib/slug';
import { BUSINESS_TYPE_IDS, parseBusinessType, parseIndustryProfile } from '@/lib/businessTypes';
import { getMasterModels } from '@/lib/masterDb';
import { getTenantModels } from '@/lib/tenantDb';
import { isOrganizationActive } from '@/lib/models/master/Organization';
import { createMobileToken } from '@/lib/mobileAuth';
import { hitRateLimit } from '@/lib/rateLimit';
import { clientIpFrom } from '@/lib/security';
import { readJsonInput } from '@/lib/validation';
import { getDictionary } from '@/lib/i18n/dict';
import { isLocale, type Locale } from '@/lib/i18n/config';
import { tr } from '@/lib/i18n/fmt';
import { parseOnboardingInput, questionViews } from '@/lib/onboardingQuestions';
import { applyOnboardingSetup } from '@/lib/onboardingSetup';

/**
 * Ro'yxatdan o'tish formasi uchun (login'siz) — ?lang=uz|ru:
 *   types — biznes yo'nalishlari;
 *   questions — ro'yxatdan o'tish ustasi savollari har tur uchun (lib/onboardingQuestions.ts → questionViews; matnlar lug'atdan).
 */
export async function GET(req: Request) {
  const lang = new URL(req.url).searchParams.get('lang');
  const d = getDictionary(isLocale(lang) ? lang : 'uz');
  const types = d.catalog.businessTypes;
  return NextResponse.json({
    types: BUSINESS_TYPE_IDS.map((key) => ({ key, label: types[key].label, description: types[key].description })),
    questions: Object.fromEntries(BUSINESS_TYPE_IDS.map((key) => [key, questionViews(key, d)])),
  });
}

/** Ilova tili (`Accept-Language`: uz | ru) — sozlash matnlari (kategoriya, chek) va xato xabari shu tilda */
function requestLocale(req: Request): Locale {
  const first = (req.headers.get('accept-language') ?? '').split(',')[0]?.trim().slice(0, 2).toLowerCase();
  return isLocale(first) ? first : 'uz';
}

/**
 * Mobil ilova ichida do'kon ochish — faqat BEPUL tarif (App Store: ilova ichida pullik tarif sotilmaydi;
 * pullik tarifga o'tish web'da). Muvaffaqiyatda darhol mobil token qaytadi — ilova shu zahoti kiradi.
 */
export async function POST(req: Request) {
  const input = await readJsonInput(req, z.object({
    name: z.string().trim().min(2, "Do'kon nomini kiriting.").max(60, "Do'kon nomi juda uzun."),
    businessType: z.string().optional(),
    /** Ishlab chiqarish sexi kichik yo'nalishi (ixtiyoriy) — lib/businessTypes.ts INDUSTRY_PROFILES */
    industryProfile: z.string().max(40).optional(),
    username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,40}$/, "Login 3–40 belgi: lotin harf, raqam yoki _."),
    password: z.string().min(6, "Parol kamida 6 ta belgidan iborat bo'lsin.").max(128),
    phone: z.string().trim().max(30).optional(),
    acceptTerms: z.literal(true, { message: "Oferta va maxfiylik siyosatiga rozilik bering." }),
    /** Ro'yxatdan o'tish ustasi: { answers?: {...}, sampleData?: boolean } — tur bo'yicha alohida tekshiriladi */
    onboarding: z.unknown().optional(),
  }), { badJson: "Noto'g'ri so'rov.", fallback: "Ma'lumotlarni tekshiring." });
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });
  const { name, username, password, phone } = input.data;
  const businessType = parseBusinessType(
    input.data.businessType && (BUSINESS_TYPE_IDS as readonly string[]).includes(input.data.businessType) ? input.data.businessType : 'general',
  );
  const locale = requestLocale(req);
  const onboarding = parseOnboardingInput(businessType, input.data.onboarding);
  if (!onboarding.ok) {
    const d = getDictionary(locale);
    const q = onboarding.key ? (d.onboarding.questions[businessType] as Record<string, { label: string }>)[onboarding.key] : undefined;
    return NextResponse.json({ error: q ? tr(d.onboarding.errors.invalid, { label: q.label }) : d.onboarding.errors.invalidGeneric }, { status: 400 });
  }

  // Spam himoyasi — web ro'yxatdan o'tish bilan bir xil chegara (bitta IP'dan sutkasiga 3 ta do'kon)
  const rl = await hitRateLimit(`register-ip:${clientIpFrom(req.headers)}`, 3, 24 * 60 * 60 * 1000);
  if (!rl.ok) return NextResponse.json({ error: "Bugun bu tarmoqdan juda ko'p do'kon ochildi. Ertaga urinib ko'ring." }, { status: 429 });

  try {
    const { orgId, adminUsername } = await createOrganization({
      name,
      // Manzil nomdan; lotin harfi bo'lmasa (kirill) — logindan. Band bo'lsa createOrganization o'zi farqlaydi
      slug: normalizeSlug(name) || normalizeSlug(username),
      adminUsername: username,
      phone: phone || undefined,
      businessType,
      industryProfile: parseIndustryProfile(input.data.industryProfile, businessType),
      adminPassword: password,
      planTier: 'free',
      isTrial: false,
      mustChangePassword: false,
      termsAcceptedAt: new Date(),
      onboarding: { answers: onboarding.answers, sampleData: onboarding.sampleData },
    });
    // Tenant sozlash (rollar, kategoriyalar, omborlar, restoran, namuna) — xatosi log qilinadi, javob buzilmaydi
    await applyOnboardingSetup(orgId, { locale });

    const { Organization } = await getMasterModels();
    const org = await Organization.findById(orgId).lean();
    if (!org) return NextResponse.json({ error: "Do'kon ochildi, lekin kirib bo'lmadi. Login bilan kiring." }, { status: 500 });
    const { User } = await getTenantModels(org.dbName);
    const user = await User.findOne({ username: adminUsername, role: 'admin' }).lean();
    if (!user) return NextResponse.json({ error: "Do'kon ochildi, lekin kirib bo'lmadi. Login bilan kiring." }, { status: 500 });

    const token = await createMobileToken({
      id: String(user._id),
      username: user.username,
      role: 'admin',
      tokenVersion: user.tokenVersion ?? 0,
      organizationId: String(org._id),
      dbName: org.dbName,
    });
    return NextResponse.json({
      token,
      user: { id: String(user._id), username: user.username, role: 'admin', fullName: user.fullName ?? null, mustChangePassword: false },
      org: { name: org.name, slug: org.slug, expiresAt: org.expiresAt, active: isOrganizationActive(org) },
    }, { status: 201 });
  } catch (e) {
    // createOrganization xatolari foydalanuvchiga mo'ljallangan (login band, nom bo'sh va h.k.)
    if (e && typeof e === 'object' && (e as { code?: number }).code === 11000) {
      return NextResponse.json({ error: "Bu login yoki manzil band. Boshqasini tanlang." }, { status: 409 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : "Do'kon ochib bo'lmadi." }, { status: 400 });
  }
}

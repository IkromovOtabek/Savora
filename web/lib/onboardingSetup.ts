/**
 * Ro'yxatdan o'tish ustasi — TENANT tomonidagi sozlash (server, DB). Master tomoni (modullar, mahsulot maydonlari,
 * birliklar, sex profili, javoblar) do'kon yaratilayotganda yoziladi: lib/organizations.ts → createOrganization.
 *
 * Bu yerda (do'kon va admin yaratilgandan KEYIN): rol shablonlari, tayyor kategoriyalar, chek matni, muddat
 * ogohlantirishi, sex omborlari, restoran sozlamalari (xizmat haqi, saboy qadoq haqi, oshxona/bar stansiyalari —
 * FAQAT lib/restaurant/setup.ts orqali) va ixtiyoriy namuna ma'lumot.
 *
 * Hech qachon tashlamaydi: har qadam alohida, xatosi log qilinadi — ro'yxatdan o'tish buzilmaydi.
 * Takror chaqirish xavfsiz (idempotent).
 */
import { getMasterModels } from './masterDb';
import { getTenantModels } from './tenantDb';
import { resolveOrgFeatures } from './features';
import { PERMISSION_KEYS, withEnabledModules } from './permissions';
import { getDictionary } from './i18n/dict';
import { DEFAULT_LOCALE, type Locale } from './i18n/config';
import { ensureDefaultRoles } from './roles';
import { ensureMainBranchId } from './mainBranch';
import { getShopSettings, saveShopSettingsPart } from './shopSettings';
import { logError } from './logger';
import { planOnboarding, type OnboardingAnswers } from './onboardingQuestions';
import { ensureCategory, seedSampleData, type SampleResult, type SetupCtx } from './onboardingSamples';
import type { SessionUser } from './session';

export interface TenantSetupReport {
  roles: boolean;
  categories: number;
  receiptNote: boolean;
  expiryWarnDays: number | null;
  /** Sex: tayyor mahsulot ombori id (xom ashyo — asosiy ombor) */
  finishedBranchId: string | null;
  restaurant: boolean;
  stations: number;
  samples: SampleResult | null;
  /** Muvaffaqiyatsiz qadamlar (log qilingan) */
  errors: string[];
}

/** Sozlash yadrosi (testlanadi: modellar tashqaridan beriladi) */
export async function runTenantSetup(ctx: SetupCtx, input: { answers: OnboardingAnswers; sampleData: boolean }): Promise<TenantSetupReport> {
  const plan = planOnboarding(ctx.businessType, input.answers);
  const r: TenantSetupReport = {
    roles: false, categories: 0, receiptNote: false, expiryWarnDays: null, finishedBranchId: null, restaurant: false, stations: 0, samples: null, errors: [],
  };
  const step = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      r.errors.push(name);
      logError(`onboarding: «${name}» sozlanmadi`, err, { dbName: ctx.user.dbName, businessType: ctx.businessType });
    }
  };
  const by = ctx.user.username;
  const t = ctx.d.onboarding;

  // Rol shablonlari (Kassir/Sotuvchi/Menejer + restoran/sex rollari) — users sahifasi kutmasdan darhol
  await step('roles', async () => {
    await ensureDefaultRoles(ctx.m.Role, ctx.businessType);
    r.roles = true;
  });

  await step('categories', async () => {
    for (const key of plan.categories) {
      await ensureCategory(ctx, t.categories[key]);
      r.categories++;
    }
  });

  // Chek matni (kafolat / 10 kunlik almashtirish) — egasi o'zi yozgan matn ustiga yozilmaydi
  if (plan.receiptNote) {
    const note = plan.receiptNote;
    await step('receipt', async () => {
      const cur = await getShopSettings(ctx.m.ShopSettings);
      if (cur.receipt.footer) return;
      await saveShopSettingsPart(ctx.m.ShopSettings, 'receipt', { footer: t.receipt[note] }, by);
      r.receiptNote = true;
    });
  }

  if (plan.expiryWarnDays) {
    const days = plan.expiryWarnDays;
    await step('expiry', async () => {
      await saveShopSettingsPart(ctx.m.ShopSettings, 'stock', { expiryWarnDays: days }, by);
      r.expiryWarnDays = days;
    });
  }

  // Sex: «Xom ashyo ombori» (asosiy ombor) + «Tayyor mahsulot ombori» (login'siz filial-ombor)
  if (plan.warehouses) {
    await step('warehouses', async () => {
      await ensureMainBranchId(ctx.m.Branch, t.warehouses.raw);
      const name = t.warehouses.finished;
      const found = await ctx.m.Branch.findOne({ name, isMain: { $ne: true } }).select('_id').lean();
      r.finishedBranchId = found ? String(found._id) : String((await ctx.m.Branch.create({ name, active: true }))._id);
    });
  }

  // Restoran: xizmat haqi, qadoq haqi, stansiyalar — «Stollar» moduli yoqiq bo'lsa (tarif)
  if (plan.restaurant && ctx.features.tables) {
    const rs = plan.restaurant;
    await step('restaurant', async () => {
      const setup = await import('./restaurant/setup');
      const rctx = { user: ctx.user, orgId: ctx.orgId, orgSlug: ctx.orgSlug, m: ctx.m, perms: ctx.perms, features: ctx.features, d: ctx.d, via: ' (sozlash)' };
      const s = await setup.saveRestaurantSettings(rctx, { serviceChargePct: rs.serviceChargePct, takeawayPackFee: rs.takeawayPackFee });
      if (!s.ok) throw new Error(s.code);
      r.restaurant = true;
      const have = await ctx.m.KitchenStation.find().select('kind').lean();
      const want: { name: string; kind: 'kitchen' | 'bar' }[] = [{ name: t.restaurant.kitchen, kind: 'kitchen' }];
      if (rs.bar) want.push({ name: t.restaurant.bar, kind: 'bar' });
      for (const w of want) {
        if (have.some((h) => h.kind === w.kind)) continue;
        const st = await setup.saveStation(rctx, { name: w.name, kind: w.kind });
        if (!st.ok) throw new Error(st.code);
        r.stations++;
      }
    });
  }

  if (input.sampleData) {
    await step('samples', async () => {
      r.samples = await seedSampleData(ctx, plan, {
        serviceKind: typeof input.answers.kind === 'string' ? input.answers.kind : undefined,
        finishedBranchId: r.finishedBranchId,
      });
    });
  }

  return r;
}

/**
 * Ro'yxatdan o'tgandan keyin chaqiriladi (web registerAction, mobil register route). Saqlangan javoblar
 * (Organization.onboardingAnswers) bo'yicha tenant'ni sozlaydi. Hech qachon tashlamaydi.
 */
export async function applyOnboardingSetup(orgId: string, opts: { locale?: Locale } = {}): Promise<TenantSetupReport | null> {
  try {
    const { Organization } = await getMasterModels();
    const org = await Organization.findById(orgId).lean();
    const stored = org?.onboardingAnswers;
    if (!org || !stored) return null;
    const m = await getTenantModels(org.dbName);
    const admin = await m.User.findOne({ role: 'admin' }).sort({ createdAt: 1 }).select('username tokenVersion').lean();
    if (!admin) return null;
    const user: SessionUser = {
      id: String(admin._id),
      username: admin.username,
      role: 'admin',
      tokenVersion: admin.tokenVersion ?? 0,
      organizationId: String(org._id),
      dbName: org.dbName,
    };
    const features = resolveOrgFeatures(org);
    const locale = opts.locale ?? DEFAULT_LOCALE;
    const ctx: SetupCtx = {
      m,
      user,
      orgId: String(org._id),
      orgSlug: org.slug,
      orgName: org.name,
      businessType: org.businessType,
      features,
      // Do'kon egasi — yoqiq modullarning barcha huquqlari (lib/permissionGuard bilan bir xil qoida)
      perms: withEnabledModules(PERMISSION_KEYS, features),
      d: getDictionary(locale),
      locale,
    };
    return await runTenantSetup(ctx, { answers: stored.answers ?? {}, sampleData: !!stored.sampleData });
  } catch (err) {
    logError('onboarding: tenant sozlanmadi', err, { orgId });
    return null;
  }
}

/**
 * Ro'yxatdan o'tish ustasi — tenant sozlash va namuna ma'lumot, haqiqiy MongoDB bilan (MONGO_TEST_URI berilsa):
 *   MONGO_TEST_URI=mongodb://127.0.0.1:27019 npx vitest run tests/onboardingSetup.test.ts
 * Har tur alohida test bazasida: birinchi ishga tushirish sozlaydi, ikkinchisi HECH NARSA qo'shmaydi (idempotent).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mongoose from 'mongoose';

vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn(async () => {}) }));

const URI = process.env.MONGO_TEST_URI;

describe.skipIf(!URI)('ro\'yxatdan o\'tish ustasi — tenant sozlash (MongoDB)', () => {
  const conns: mongoose.Connection[] = [];
  let runTenantSetup: typeof import('@/lib/onboardingSetup').runTenantSetup;
  let resolveOrgFeatures: typeof import('@/lib/features').resolveOrgFeatures;
  let onboardingFeatureOverrides: typeof import('@/lib/onboardingQuestions').onboardingFeatureOverrides;
  let planOnboarding: typeof import('@/lib/onboardingQuestions').planOnboarding;
  let completeAnswers: typeof import('@/lib/onboardingQuestions').completeAnswers;
  let perms: typeof import('@/lib/permissions');
  let getDictionary: typeof import('@/lib/i18n/dict').getDictionary;
  let schemas: Record<string, mongoose.Schema>;

  beforeAll(async () => {
    schemas = {
      User: (await import('@/lib/models/tenant/User')).userSchema,
      Branch: (await import('@/lib/models/tenant/Branch')).branchSchema,
      Product: (await import('@/lib/models/tenant/Product')).productSchema,
      Role: (await import('@/lib/models/tenant/Role')).roleSchema,
      ShopSettings: (await import('@/lib/models/tenant/ShopSettings')).shopSettingsSchema,
      ProductCategory: (await import('@/lib/models/tenant/ProductCategory')).productCategorySchema,
      Hall: (await import('@/lib/models/tenant/Hall')).hallSchema,
      Table: (await import('@/lib/models/tenant/Table')).tableSchema,
      KitchenStation: (await import('@/lib/models/tenant/KitchenStation')).kitchenStationSchema,
      Order: (await import('@/lib/models/tenant/Order')).orderSchema,
      Sale: (await import('@/lib/models/tenant/Sale')).saleSchema,
      Recipe: (await import('@/lib/models/tenant/Recipe')).recipeSchema,
    } as unknown as Record<string, mongoose.Schema>;
    ({ runTenantSetup } = await import('@/lib/onboardingSetup'));
    ({ resolveOrgFeatures } = await import('@/lib/features'));
    ({ onboardingFeatureOverrides, planOnboarding, completeAnswers } = await import('@/lib/onboardingQuestions'));
    perms = await import('@/lib/permissions');
    ({ getDictionary } = await import('@/lib/i18n/dict'));
  });

  afterAll(async () => {
    for (const c of conns) {
      await c.dropDatabase().catch(() => {});
      await c.close();
    }
  });

  /** Yangi test bazasi + yangi do'kon konteksti (tarif + tur + javoblar → features — createOrganization bilan bir xil) */
  async function shop(businessType: string, tier: string, answers: Record<string, string | number | boolean>, locale: 'uz' | 'ru' = 'uz') {
    const conn = await mongoose.createConnection(`${URI}/savora_onb_test_${businessType}_${Date.now()}`).asPromise();
    conns.push(conn);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m: any = Object.fromEntries(Object.entries(schemas).map(([k, s]) => [k, conn.model(k, s)]));
    await Promise.all(Object.values(m).map((M) => (M as mongoose.Model<unknown>).init()));
    const full = completeAnswers(businessType, answers);
    const features = resolveOrgFeatures({
      plan: { tier, maxFilial: 1, maxUsers: 2 },
      businessType,
      features: onboardingFeatureOverrides({ tier, businessType, plan: planOnboarding(businessType, full) }),
    });
    const admin = await m.User.create({ username: `adm_${businessType}`, password: 'secret123', role: 'admin', active: true });
    const ctx = {
      m,
      user: { id: String(admin._id), username: admin.username, role: 'admin' as const, tokenVersion: 0, organizationId: 'a'.repeat(24), dbName: conn.name },
      orgId: 'a'.repeat(24),
      orgSlug: `t-${businessType}`,
      orgName: 'Test',
      businessType,
      features,
      perms: perms.withEnabledModules(perms.PERMISSION_KEYS, features),
      d: getDictionary(locale),
      locale,
    };
    return { ctx, m, answers: full };
  }

  it('restoran: xizmat haqi, qadoq, oshxona + bar, zal + 4 stol; xom ashyo omborda, taomlar retsept bilan menyuda; takror — o\'zgarmaydi', async () => {
    const { ctx, m, answers } = await shop('restaurant', 'pro', { service: 'waiter', bar: true, takeaway: true, packFee: 2000, serviceCharge: 10 });
    const r1 = await runTenantSetup(ctx, { answers, sampleData: true });
    expect(r1.errors).toEqual([]);
    expect(r1.restaurant).toBe(true);
    expect(r1.stations).toBe(2);
    // 8 xom ashyo + 4 taom (retsept) + 2 tayyor tovar + 1 xizmat
    expect(r1.samples).toEqual({ products: 15, tables: 4, recipes: 0 });
    const s = await m.ShopSettings.findOne({ key: 'main' }).lean();
    expect(s.restaurant).toMatchObject({ serviceChargePct: 10, takeawayPackFee: 2000 });
    expect((await m.KitchenStation.find().lean()).map((x: { kind: string }) => x.kind).sort()).toEqual(['bar', 'kitchen']);
    // Ichimlik — bar stansiyasida
    const bar = await m.KitchenStation.findOne({ kind: 'bar' }).lean();
    const tea = await m.Product.findOne({ itemCode: 'NAMUNA-RES-CHOY' }).lean();
    expect(String(tea.stationId)).toBe(String(bar._id));
    expect(await m.Role.exists({ name: 'Ofitsant' })).toBeTruthy();
    // Menyu va ombor ajratilgan: xom ashyo — menyuda emas, taom — retsept bilan, non — stansiyasiz tayyor tovar
    const rice = await m.Product.findOne({ itemCode: 'NAMUNA-RES-GURUCH' }).lean();
    expect(rice).toMatchObject({ kind: 'goods', menuItem: false, unit: 'kg', trackQuantity: true });
    const osh = await m.Product.findOne({ itemCode: 'NAMUNA-RES-OSH' }).lean();
    expect(osh).toMatchObject({ kind: 'bundle', menuItem: true, trackQuantity: false });
    expect(osh.bundleItems).toHaveLength(5);
    expect(osh.bundleItems.find((i: { productId: unknown }) => String(i.productId) === String(rice._id)).qty).toBe(0.15);
    const non = await m.Product.findOne({ itemCode: 'NAMUNA-RES-NON' }).lean();
    expect(non).toMatchObject({ kind: 'goods', menuItem: true });
    expect(non.stationId).toBeUndefined();
    expect((await m.ShopSettings.findOne({ key: 'main' }).lean()).menuVersion).toBe(1);

    const r2 = await runTenantSetup(ctx, { answers, sampleData: true });
    expect(r2.errors).toEqual([]);
    expect(r2.stations).toBe(0);
    expect(r2.samples).toEqual({ products: 0, tables: 0, recipes: 0 });
    expect(await m.Product.countDocuments()).toBe(15);
    expect(await m.Table.countDocuments()).toBe(4);
    expect(await m.Hall.countDocuments()).toBe(1);
    expect(await m.KitchenStation.countDocuments()).toBe(2);
  }, 20_000); // 15 ta namuna + retsept + stansiyalar — to'liq to'plam parallel yuklamasida 5 s dan oshishi mumkin

  it('restoran, o\'zi xizmat: xizmat haqi 0; bar yo\'q — faqat oshxona', async () => {
    const { ctx, m, answers } = await shop('restaurant', 'starter', { service: 'self', serviceCharge: 15, bar: false, takeaway: false });
    const r = await runTenantSetup(ctx, { answers, sampleData: false });
    expect(r.errors).toEqual([]);
    expect((await m.ShopSettings.findOne({ key: 'main' }).lean()).restaurant).toMatchObject({ serviceChargePct: 0, takeawayPackFee: 0 });
    expect(await m.KitchenStation.countDocuments()).toBe(1);
    expect(await m.Product.countDocuments()).toBe(0);
  });

  it('sex: «Xom ashyo» (asosiy) + «Tayyor mahsulot» omborlari, namuna — xom ashyo, mahsulot va 1 texkarta', async () => {
    const { ctx, m, answers } = await shop('manufacturing', 'pro', { profile: 'bakery', warehouses: true });
    const r1 = await runTenantSetup(ctx, { answers, sampleData: true });
    expect(r1.errors).toEqual([]);
    expect(r1.samples).toEqual({ products: 4, tables: 0, recipes: 1 });
    const main = await m.Branch.findOne({ isMain: true }).lean();
    expect(main.name).toBe('Xom ashyo ombori');
    expect(String(r1.finishedBranchId)).not.toBe(String(main._id));
    const out = await m.Product.findOne({ itemCode: 'NAMUNA-SEX-NON' }).lean();
    expect(String(out.branchId)).toBe(r1.finishedBranchId);
    const recipe = await m.Recipe.findOne().lean();
    expect(recipe.items).toHaveLength(3);
    expect(await m.Role.exists({ name: "Sex boshlig'i" })).toBeTruthy();

    const r2 = await runTenantSetup(ctx, { answers, sampleData: true });
    expect(r2.errors).toEqual([]);
    expect(r2.samples).toEqual({ products: 0, tables: 0, recipes: 0 });
    expect(r2.finishedBranchId).toBe(r1.finishedBranchId);
    expect(await m.Branch.countDocuments()).toBe(2);
    expect(await m.Product.countDocuments()).toBe(4);
    expect(await m.Recipe.countDocuments()).toBe(1);
  });

  it('sex, bepul tarif: «Ishlab chiqarish» moduli yo\'q — texkarta yaratilmaydi, xato ham yo\'q', async () => {
    const { ctx, m, answers } = await shop('manufacturing', 'free', { profile: 'sewing', warehouses: false });
    const r = await runTenantSetup(ctx, { answers, sampleData: true });
    expect(r.errors).toEqual([]);
    expect(r.finishedBranchId).toBeNull();
    expect(r.samples).toEqual({ products: 4, tables: 0, recipes: 0 });
    expect(await m.Branch.countDocuments()).toBe(1);
  });

  it('oziq-ovqat (ru): muddat ogohlantirishi 7 kun, 7 ta namuna; o\'chirilgan namuna qayta yaratilmaydi', async () => {
    const { ctx, m, answers } = await shop('grocery', 'starter', {}, 'ru');
    const r1 = await runTenantSetup(ctx, { answers, sampleData: true });
    expect(r1.errors).toEqual([]);
    expect(r1.expiryWarnDays).toBe(7);
    expect((await m.ShopSettings.findOne({ key: 'main' }).lean()).stock).toEqual({ expiryWarnDays: 7 });
    expect(r1.samples?.products).toBe(7);
    expect(await m.Product.exists({ name: 'Молоко 1 л' })).toBeTruthy();
    await m.Product.updateOne({ itemCode: 'NAMUNA-OZQ-SUT' }, { $set: { deletedAt: new Date() } });
    const r2 = await runTenantSetup(ctx, { answers, sampleData: true });
    expect(r2.samples?.products).toBe(0);
  });

  it('telefon: tayyor kategoriyalar (b/u bilan), namunalar kategoriyada; texnika: kafolat chek matni (mavjud matn ustiga yozilmaydi)', async () => {
    const ph = await shop('phone_shop', 'pro', { used: true });
    const r = await runTenantSetup(ph.ctx, { answers: ph.answers, sampleData: true });
    expect(r.errors).toEqual([]);
    expect(r.categories).toBe(3);
    expect(await ph.m.ProductCategory.countDocuments()).toBe(3);
    const used = await ph.m.Product.findOne({ itemCode: 'NAMUNA-TEL-IP11BU' }).lean();
    expect(used.category).toBe('B/u telefonlar');
    await runTenantSetup(ph.ctx, { answers: ph.answers, sampleData: true });
    expect(await ph.m.ProductCategory.countDocuments()).toBe(3);

    const el = await shop('electronics', 'pro', { warranty: true });
    expect((await runTenantSetup(el.ctx, { answers: el.answers, sampleData: false })).receiptNote).toBe(true);
    const footer = (await el.m.ShopSettings.findOne({ key: 'main' }).lean()).receipt.footer;
    expect(footer).toContain('Kafolat');
    await el.m.ShopSettings.updateOne({ key: 'main' }, { $set: { 'receipt.footer': 'Mening matnim' } });
    expect((await runTenantSetup(el.ctx, { answers: el.answers, sampleData: false })).receiptNote).toBe(false);
    expect((await el.m.ShopSettings.findOne({ key: 'main' }).lean()).receipt.footer).toBe('Mening matnim');
  });

  it('namuna tovarlar Savora Market\'ga avtomatik chiqmaydi; haqiqiy tovar chiqadi; egasi ko\'rsatsa — chiqadi', async () => {
    const { loadEcomGroups } = await import('@/lib/ecom/sync');
    const { setEcomListed } = await import('@/lib/ecom/manage');
    const { ctx, m, answers } = await shop('general', 'starter', {});
    const r = await runTenantSetup(ctx, { answers, sampleData: true });
    expect(r.errors).toEqual([]);
    expect(r.samples?.products).toBe(6);
    const groups = await loadEcomGroups(m.Product, true);
    expect(groups.find((g) => g.name === 'Batareyka AA')?.state).toBe('hidden');
    expect(groups.filter((g) => g.state === 'live')).toEqual([]);

    const branchId = (await m.Branch.findOne({ isMain: true }).lean())._id;
    await m.Product.create({
      productId: 'REAL-1', imei: 'REAL-1', name: 'Choynak', salePrice: 50000, purchasePrice: 30000, trackQuantity: true,
      quantity: 5, soldQuantity: 0, status: 'in_stock', branchId, unit: 'dona', createdBy: 'adm_general',
    });
    const after = await loadEcomGroups(m.Product, true);
    expect(after.filter((g) => g.state === 'live').map((g) => g.name)).toEqual(['Choynak']);

    const gugurt = after.find((g) => g.name === 'Gugurt')!;
    await setEcomListed(m, { username: 'adm_general', role: 'admin', dbName: ctx.user.dbName }, [gugurt.key], true);
    const shown = await loadEcomGroups(m.Product, true);
    expect(shown.filter((g) => g.state === 'live').map((g) => g.name).sort()).toEqual(['Choynak', 'Gugurt']);
  });

  it('xizmat (avtoservis): xizmat + ehtiyot qism namunalari', async () => {
    const { ctx, m, answers } = await shop('service', 'pro', { kind: 'auto' });
    const r = await runTenantSetup(ctx, { answers, sampleData: true });
    expect(r.errors).toEqual([]);
    expect(r.samples?.products).toBe(5);
    expect(await m.Product.countDocuments({ kind: 'service' })).toBe(3);
  });
});

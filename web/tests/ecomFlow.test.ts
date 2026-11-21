/**
 * E-commerce oqimi — haqiqiy MongoDB bilan (MONGO_TEST_URI berilsa):
 *   MONGO_TEST_URI=mongodb://127.0.0.1:27019 npx vitest run tests/ecomFlow.test.ts
 * Katalog sinxronlash (narxsiz chiqmaydi, avto/qo'lda rejim, guruhlash) → xaridor ro'yxati → buyurtma (jonli
 * tekshiruv, narxi har xil guruh) → qabul → yakunlash (ombordan ayirish + sotuv, idempotent) → bekor qilish.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Types } from 'mongoose';

vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn(async () => {}) }));
vi.mock('@/lib/push', () => ({ pushToShop: vi.fn(async () => 1) }));
vi.mock('@/lib/telegram', () => ({ sendTelegramTo: vi.fn(async () => true), tgEscape: (v: unknown) => String(v) }));

const URI = process.env.MONGO_TEST_URI;
const RUN = Math.random().toString(36).slice(2, 8);

describe.skipIf(!URI)('e-commerce oqimi (MongoDB)', () => {
  let master: Awaited<ReturnType<typeof import('@/lib/masterDb').getMasterModels>>;
  let tenant: Awaited<ReturnType<typeof import('@/lib/tenantDb').getTenantModels>>;
  let sync: typeof import('@/lib/ecom/sync');
  let manage: typeof import('@/lib/ecom/manage');
  let orders: typeof import('@/lib/ecom/orders');
  let auth: typeof import('@/lib/ecom/buyerAuth');
  let shopSettings: typeof import('@/lib/shopSettings');
  const orgId = new Types.ObjectId();
  const dbName = `ecomtest_t_${RUN}`;
  const slug = `ecomtest-${RUN}`;
  const branchId = new Types.ObjectId();
  const ids: Record<string, Types.ObjectId> = {};
  const actor = { id: new Types.ObjectId().toString(), username: 'egasi', role: 'admin' as const, dbName };

  beforeAll(async () => {
    process.env.MONGO_URI = URI;
    process.env.MASTER_DB_NAME = `ecomtest_master_${RUN}`;
    master = await (await import('@/lib/masterDb')).getMasterModels();
    tenant = await (await import('@/lib/tenantDb')).getTenantModels(dbName);
    sync = await import('@/lib/ecom/sync');
    manage = await import('@/lib/ecom/manage');
    orders = await import('@/lib/ecom/orders');
    auth = await import('@/lib/ecom/buyerAuth');
    shopSettings = await import('@/lib/shopSettings');

    await master.Organization.create({
      _id: orgId, name: 'Test Do\'kon', slug, dbName, status: 'active',
      expiresAt: new Date(Date.now() + 30 * 86400_000), plan: { tier: 'pro', maxFilial: 3, maxUsers: 5 },
    });
    const base = { branchId, purchasePrice: 1000, status: 'in_stock' as const, kind: 'goods' as const };
    const mk = async (key: string, over: Record<string, unknown>) => {
      const p = await tenant.Product.create({ ...base, imei: `T${RUN}${key}`.toUpperCase(), ...over });
      ids[key] = p._id;
    };
    await mk('choy', { name: 'Choynak', salePrice: 50000, trackQuantity: true, quantity: 10 });
    await mk('narxsiz', { name: 'Narxsiz tovar', salePrice: 0, trackQuantity: true, quantity: 5 });
    await mk('ip1', { name: 'iPhone 15', variantName: '128GB', salePrice: 10_500_000, trackQuantity: false, quantity: 1 });
    await mk('ip2', { name: 'iPhone 15', variantName: '128GB', salePrice: 11_000_000, trackQuantity: false, quantity: 1 });
    await mk('xizmat', { name: 'Ta\'mirlash', salePrice: 20000, kind: 'service' });
  }, 30_000);

  afterAll(async () => {
    if (!master) return;
    await master.conn.dropDatabase().catch(() => {});
    await tenant.conn.dropDatabase().catch(() => {});
    await master.conn.close().catch(() => {});
  });

  const listings = () => master.MarketListing.find({ orgId }).sort({ name: 1 }).lean();

  it('sinxron: narxi bor tovarlar chiqadi, narxsiz va xizmat chiqmaydi, bir xil iPhone\'lar bitta kartochka', async () => {
    await sync.syncOrgListingsById(String(orgId));
    const ls = await listings();
    expect(ls.map((l) => l.name)).toEqual(['Choynak', 'iPhone 15 · 128GB']);
    const ip = ls[1];
    expect(ip.qty).toBe(2);
    expect(ip.price).toBe(10_500_000);
    expect(ip.priceFrom).toBe(true);
    // Ichki maydonlar ochiq kartochkaga chiqmaydi
    const { searchListings } = await import('@/lib/ecom/catalog');
    const res = await searchListings({ shop: slug });
    expect(res.total).toBe(2);
    expect(JSON.stringify(res.items)).not.toMatch(/dbName|productIds|purchasePrice|imei/i);
  });

  it('avtomatik chiqarish o\'chiq — faqat belgilangan; qayta yoqilganda hammasi', async () => {
    await shopSettings.saveShopSettingsPart(tenant.ShopSettings, 'ecom', { autoPublish: false }, 'egasi');
    await sync.syncOrgListingsById(String(orgId));
    expect(await listings()).toHaveLength(0);

    const { groups } = await manage.shopEcomGroups(tenant);
    const choy = groups.find((g) => g.name === 'Choynak')!;
    await manage.setEcomListed(tenant, actor, [choy.key], true);
    await sync.syncOrgListingsById(String(orgId));
    expect((await listings()).map((l) => l.name)).toEqual(['Choynak']);

    await shopSettings.saveShopSettingsPart(tenant.ShopSettings, 'ecom', { autoPublish: true }, 'egasi');
    await sync.syncOrgListingsById(String(orgId));
    expect(await listings()).toHaveLength(2);
  });

  it('tahrir: tavsif, eski narx, begona rasm rad etiladi', async () => {
    const { groups } = await manage.shopEcomGroups(tenant);
    const choy = groups.find((g) => g.name === 'Choynak')!;
    const bad = await manage.applyEcomEdit(tenant, actor, choy.key, { images: ['https://evil.example/a.jpg'] });
    expect(bad).toEqual({ ok: false, error: 'badImages' });
    const badOld = await manage.applyEcomEdit(tenant, actor, choy.key, { oldPrice: '40000' });
    expect(badOld).toEqual({ ok: false, error: 'badOldPrice' });
    // 0 — kassadagi narxni ham o'chirardi (bozordan olish — «Yashirish»)
    expect(await manage.applyEcomEdit(tenant, actor, choy.key, { salePrice: '0' })).toEqual({ ok: false, error: 'badPrice' });
    expect((await tenant.Product.findById(ids.choy).lean())!.salePrice).toBe(50000);
    const ok = await manage.applyEcomEdit(tenant, actor, choy.key, {
      description: 'Elektr choynak, 1.7 l', oldPrice: '65 000', images: [`/api/uploads/${dbName}/abcdef12-1.jpg`],
    });
    expect(ok.ok).toBe(true);
    await sync.syncOrgListingsById(String(orgId));
    const l = (await listings()).find((x) => x.name === 'Choynak')!;
    expect(l.description).toBe('Elektr choynak, 1.7 l');
    expect(l.oldPrice).toBe(65000);
    expect(l.images).toEqual([`/api/uploads/${dbName}/abcdef12-1.jpg`]);
  });

  let orderId = '';
  it('buyurtma: jonli tekshiruv, narxi har xil guruhda haqiqiy jami', async () => {
    const reg = await auth.registerBuyer({ name: 'Ali Valiyev', phone: '+998 90 111 22 33', password: 'secret12' }, '127.0.0.1');
    expect(reg.ok).toBe(true);
    if (!reg.ok) return;
    const buyer = { id: String(reg.buyer._id), name: reg.buyer.name, phone: reg.buyer.phone };
    expect((await auth.registerBuyer({ name: 'Boshqa', phone: '901112233', password: 'secret12' }, '127.0.0.2'))).toEqual({ ok: false, error: 'exists' });

    const ls = await listings();
    const choy = ls.find((l) => l.name === 'Choynak')!;
    const ip = ls.find((l) => l.name.startsWith('iPhone'))!;

    const tooMany = await orders.placeMarketOrders(buyer, { lines: [{ listingId: String(choy._id), qty: 11 }], delivery: 'pickup' });
    expect(tooMany).toMatchObject({ ok: false, error: 'notEnough', available: 10 });
    const stale = await orders.placeMarketOrders(buyer, { lines: [{ listingId: String(choy._id), qty: 1, price: 1 }], delivery: 'pickup' });
    expect(stale).toMatchObject({ ok: false, error: 'priceChanged', price: 50000 });
    const noAddr = await orders.placeMarketOrders(buyer, { lines: [{ listingId: String(choy._id), qty: 1 }], delivery: 'delivery', address: '' });
    expect(noAddr).toMatchObject({ ok: false, error: 'addressRequired' });

    const r = await orders.placeMarketOrders(buyer, {
      lines: [{ listingId: String(choy._id), qty: 3, price: 50000 }, { listingId: String(ip._id), qty: 2 }],
      delivery: 'delivery', address: 'Toshkent, Chilonzor 9', note: 'Kechqurun',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.orders).toHaveLength(1);
    // 3 × 50 000 + (10 500 000 + 11 000 000)
    expect(r.orders[0].total).toBe(150_000 + 21_500_000);
    orderId = r.orders[0].id;

    const mine = await orders.buyerOrders(buyer.id);
    expect(mine[0].status).toBe('new');
    expect(JSON.stringify(mine)).not.toMatch(/productIds|buyerPhone/);
    const shop = await orders.shopOrders(String(orgId), 'active');
    expect(shop[0]).toMatchObject({ buyerName: 'Ali Valiyev', buyerPhone: '+998901112233', address: 'Toshkent, Chilonzor 9' });
  });

  it('qabul → yakunlash: ombordan ayiriladi, sotuv summasi buyurtma jamiga teng, qayta bosish xavfsiz', async () => {
    expect(await orders.setShopOrderStatus(String(orgId), actor, orderId, 'accept')).toEqual({ ok: true });
    expect(await orders.setShopOrderStatus(String(orgId), actor, orderId, 'accept')).toEqual({ ok: false, error: 'badState' });

    const done = await orders.completeShopOrder(String(orgId), actor, orderId);
    expect(done.ok).toBe(true);
    const sales = await tenant.Sale.find({ clientSaleId: { $regex: `^ecom-${orderId}-` } }).lean();
    expect(sales).toHaveLength(3);
    expect(sales.reduce((s, x) => s + x.totalAmount, 0)).toBe(150_000 + 21_500_000);
    expect(sales.every((s) => s.paymentType === 'cash' && s.status === 'paid')).toBe(true);

    const choy = await tenant.Product.findById(ids.choy).lean();
    expect(choy!.soldQuantity).toBe(3);
    const ip1 = await tenant.Product.findById(ids.ip1).lean();
    const ip2 = await tenant.Product.findById(ids.ip2).lean();
    expect([ip1!.status, ip2!.status]).toEqual(['sold', 'sold']);

    // Qayta yakunlash — holat o'zgargan, sotuv qo'shilmaydi
    expect(await orders.completeShopOrder(String(orgId), actor, orderId)).toEqual({ ok: false, error: 'badState' });
    expect(await tenant.Sale.countDocuments({ clientSaleId: { $regex: `^ecom-${orderId}-` } })).toBe(3);

    // Katalog: iPhone tugadi, choynak 7 ta
    await sync.syncOrgListingsById(String(orgId));
    const ls = await listings();
    expect(ls.map((l) => [l.name, l.qty])).toEqual([['Choynak', 7]]);
  });

  it('xaridor faqat «yangi» buyurtmani bekor qila oladi; boshqa do\'kon buyurtmasini boshqara olmaydi', async () => {
    const reg = await auth.loginBuyer({ phone: '901112233', password: 'secret12' }, '127.0.0.1');
    expect(reg.ok).toBe(true);
    if (!reg.ok) return;
    const buyer = { id: String(reg.buyer._id), name: reg.buyer.name, phone: reg.buyer.phone };
    expect((await auth.loginBuyer({ phone: '901112233', password: 'xato' }, '127.0.0.1'))).toEqual({ ok: false, error: 'invalid' });

    const choy = (await listings())[0];
    const r = await orders.placeMarketOrders(buyer, { lines: [{ listingId: String(choy._id), qty: 1 }], delivery: 'pickup' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const id = r.orders[0].id;
    expect(await orders.setShopOrderStatus(new Types.ObjectId().toString(), actor, id, 'accept')).toEqual({ ok: false, error: 'notFound' });
    expect(await orders.cancelBuyerOrder(new Types.ObjectId().toString(), id)).toBe(false);
    expect(await orders.cancelBuyerOrder(buyer.id, id)).toBe(true);
    expect(await orders.cancelBuyerOrder(buyer.id, orderId)).toBe(false);
  });

  it('qabul: qoldiq allaqachon qabul qilingan buyurtmalarga ketgan bo\'lsa — «yetarli emas», bo\'shagach qabul bo\'ladi', async () => {
    const reg = await auth.loginBuyer({ phone: '901112233', password: 'secret12' }, '127.0.0.1');
    expect(reg.ok).toBe(true);
    if (!reg.ok) return;
    const buyer = { id: String(reg.buyer._id), name: reg.buyer.name, phone: reg.buyer.phone };
    const choy = (await listings())[0];
    expect(choy.qty).toBe(7);
    const place = async (qty: number) => {
      const r = await orders.placeMarketOrders(buyer, { lines: [{ listingId: String(choy._id), qty }], delivery: 'pickup' });
      expect(r.ok).toBe(true);
      return r.ok ? r.orders[0].id : '';
    };
    // Har biri alohida qoldiqqa sig'adi (buyurtma berishda band qilinmaydi), ikkalasi birga — yo'q
    const a = await place(5);
    const b = await place(3);
    expect(await orders.setShopOrderStatus(String(orgId), actor, a, 'accept')).toEqual({ ok: true });
    expect(await orders.setShopOrderStatus(String(orgId), actor, b, 'accept')).toEqual({ ok: false, error: 'notEnough', item: 'Choynak' });
    expect((await master.MarketOrder.findById(b).lean())?.status).toBe('new');
    // Birinchisi rad etilgach qoldiq bo'shaydi
    expect(await orders.setShopOrderStatus(String(orgId), actor, a, 'reject')).toEqual({ ok: true });
    expect(await orders.setShopOrderStatus(String(orgId), actor, b, 'accept')).toEqual({ ok: true });
    expect(await orders.setShopOrderStatus(String(orgId), actor, b, 'reject')).toEqual({ ok: true });
  });

  it('xaridor hisobini o\'chirish: parol, qabul qilingan buyurtma to\'sadi, keyin yangisi bekor + ma\'lumot yashiriladi', async () => {
    const reg = await auth.registerBuyer({ name: 'Olim Karimov', phone: '+998 93 555 44 33', password: 'secret12' }, '127.0.0.3');
    expect(reg.ok).toBe(true);
    if (!reg.ok) return;
    const buyer = { id: String(reg.buyer._id), name: reg.buyer.name, phone: reg.buyer.phone };
    const choy = (await listings())[0];
    const place = async () => {
      const r = await orders.placeMarketOrders(buyer, { lines: [{ listingId: String(choy._id), qty: 1 }], delivery: 'delivery', address: 'Yunusobod 4', note: 'Tez' });
      expect(r.ok).toBe(true);
      return r.ok ? r.orders[0].id : '';
    };
    const fresh = await place();
    const accepted = await place();
    expect(await orders.setShopOrderStatus(String(orgId), actor, accepted, 'accept')).toEqual({ ok: true });

    expect(await auth.deleteBuyerAccount(buyer.id, 'xato')).toEqual({ ok: false, error: 'badPassword' });
    expect(await auth.deleteBuyerAccount(buyer.id, 'secret12')).toEqual({ ok: false, error: 'activeOrders' });
    expect(await master.Buyer.exists({ _id: buyer.id })).toBeTruthy();

    expect(await orders.setShopOrderStatus(String(orgId), actor, accepted, 'reject', 'Qoldiq yo\'q')).toEqual({ ok: true });
    expect(await auth.deleteBuyerAccount(buyer.id, 'secret12')).toEqual({ ok: true });

    expect(await master.Buyer.exists({ _id: buyer.id })).toBeNull();
    const left = await master.MarketOrder.find({ buyerId: buyer.id }).lean();
    expect(left).toHaveLength(2);
    expect(left.find((o) => String(o._id) === fresh)?.status).toBe('cancelled');
    for (const o of left) {
      expect(o).toMatchObject({ buyerName: auth.DELETED_BUYER_NAME, buyerPhone: '—' });
      expect(o.address).toBeUndefined();
      expect(o.note).toBeUndefined();
    }
    // Eski kirish ishlamaydi, raqam bo'shadi
    expect(await auth.loginBuyer({ phone: '935554433', password: 'secret12' }, '127.0.0.3')).toEqual({ ok: false, error: 'invalid' });
    expect((await auth.registerBuyer({ name: 'Olim', phone: '935554433', password: 'secret12' }, '127.0.0.3')).ok).toBe(true);
    expect(await auth.deleteBuyerAccount(new Types.ObjectId().toString(), 'secret12')).toEqual({ ok: false, error: 'notFound' });
  });

  it('muddati tugagan do\'kon tovarlari katalogdan olib tashlanadi', async () => {
    await master.Organization.updateOne({ _id: orgId }, { $set: { status: 'expired' } });
    await sync.syncOrgListingsById(String(orgId));
    expect(await listings()).toHaveLength(0);
  });
});

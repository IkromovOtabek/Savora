/**
 * Ishlab chiqarish va kirim oqimi — haqiqiy MongoDB bilan (MONGO_TEST_URI berilsa):
 *   MONGO_TEST_URI=mongodb://127.0.0.1:27019 npx vitest run tests/productionFlow.test.ts
 * Texkarta (xarid birligida kiritish, versiya) → ehtiyoj → akt (idempotent) → haqiqiy sarf → «bajarildi»
 * (xom ashyo chiqadi, tayyor mahsulot boshqa omborda yaratiladi, tannarx, brak hujjati) → yetmasa hech narsa
 * yozilmaydi → parallel «bajarildi» bir marta → kirim akti (qop → kg, o'rtacha tannarx, qarz, to'lov) →
 * narxsiz kirim (omborchi) → boshqa omborga kirim (nusxa) → PO (qisman/to'liq qabul) → ishbay (yozish,
 * tasdiqlash, to'lov → kassa chiqimi) → minimal qoldiq → filial doirasi.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mongoose, { Types } from 'mongoose';

vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn(async () => {}) }));

const URI = process.env.MONGO_TEST_URI;

describe.skipIf(!URI)('ishlab chiqarish oqimi (MongoDB)', () => {
  let conn: mongoose.Connection;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let m: any;
  let recipes: typeof import('@/lib/production/recipes');
  let orders: typeof import('@/lib/production/orders');
  let receipts: typeof import('@/lib/production/receipts');
  let pos: typeof import('@/lib/production/purchaseOrders');
  let pw: typeof import('@/lib/production/piecework');
  let catalog: typeof import('@/lib/production/catalog');
  let sumSupplierEntries: typeof import('@/lib/suppliers').sumSupplierEntries;
  let d: import('@/lib/i18n/dict').Dict;
  let features: import('@/lib/features').OrgFeatures;
  type PK = import('@/lib/permissions').PermissionKey;

  const raw = new Types.ObjectId(); // xom ashyo ombori (asosiy)
  const fin = new Types.ObjectId(); // tayyor mahsulot ombori
  const ids = {
    admin: new Types.ObjectId().toString(),
    ombor: new Types.ObjectId().toString(),
    boshliq: new Types.ObjectId().toString(),
    usta: new Types.ObjectId().toString(),
    usta2: new Types.ObjectId().toString(),
  };
  const user = (id: string, username: string, role: 'admin' | 'user' = 'user', branchId: Types.ObjectId = raw) =>
    ({ id, username, role, tokenVersion: 0, dbName: 'test', organizationId: 'org', ...(role === 'user' ? { branchId: String(branchId) } : {}) });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctx = (u: ReturnType<typeof user>, perms: PK[]): any => ({ user: u, orgId: 'a'.repeat(24), orgName: 'Non sexi', m, perms: new Set(perms), features, d });
  let admin: ReturnType<typeof ctx>, ombor: ReturnType<typeof ctx>, boshliq: ReturnType<typeof ctx>, usta: ReturnType<typeof ctx>, finUser: ReturnType<typeof ctx>;

  const P: Record<string, string> = {};
  let supplierId: string;
  let recipeId: string;

  const doc = async (id: string) => m.Product.findById(id).lean();
  const avail = async (id: string) => { const p = await doc(id); return Math.round((p.quantity - p.soldQuantity) * 1000) / 1000; };

  beforeAll(async () => {
    conn = await mongoose.createConnection(`${URI}/savora_prod_test_${Date.now()}`).asPromise();
    const s = {
      Product: (await import('@/lib/models/tenant/Product')).productSchema,
      Branch: (await import('@/lib/models/tenant/Branch')).branchSchema,
      User: (await import('@/lib/models/tenant/User')).userSchema,
      Supplier: (await import('@/lib/models/tenant/Supplier')).supplierSchema,
      SupplierEntry: (await import('@/lib/models/tenant/Supplier')).supplierEntrySchema,
      StockAdjustment: (await import('@/lib/models/tenant/StockAdjustment')).stockAdjustmentSchema,
      CashFlow: (await import('@/lib/models/tenant/CashFlow')).cashFlowSchema,
      FinanceCategory: (await import('@/lib/models/tenant/FinanceCategory')).financeCategorySchema,
      Recipe: (await import('@/lib/models/tenant/Recipe')).recipeSchema,
      ProductionOrder: (await import('@/lib/models/tenant/ProductionOrder')).productionOrderSchema,
      GoodsReceipt: (await import('@/lib/models/tenant/GoodsReceipt')).goodsReceiptSchema,
      PurchaseOrder: (await import('@/lib/models/tenant/PurchaseOrder')).purchaseOrderSchema,
      PieceworkEntry: (await import('@/lib/models/tenant/PieceworkEntry')).pieceworkEntrySchema,
    };
    m = Object.fromEntries(Object.entries(s).map(([k, schema]) => [k, conn.model(k, schema as mongoose.Schema)]));
    await Promise.all(Object.values(m).map((M) => (M as mongoose.Model<unknown>).init()));
    recipes = await import('@/lib/production/recipes');
    orders = await import('@/lib/production/orders');
    receipts = await import('@/lib/production/receipts');
    pos = await import('@/lib/production/purchaseOrders');
    pw = await import('@/lib/production/piecework');
    catalog = await import('@/lib/production/catalog');
    sumSupplierEntries = (await import('@/lib/suppliers')).sumSupplierEntries;
    d = (await import('@/lib/i18n/dict')).getDictionary('uz');
    const { resolveOrgFeatures } = await import('@/lib/features');
    const { PERMISSION_KEYS } = await import('@/lib/permissions');
    const { MANUFACTURING_ROLES } = await import('@/lib/models/tenant/Role');
    features = resolveOrgFeatures({ plan: { tier: 'pro', maxFilial: 3, maxUsers: 10 }, businessType: 'manufacturing' });
    const role = (n: string) => MANUFACTURING_ROLES.find((r) => r.name === n)!.permissions;
    admin = ctx(user(ids.admin, 'egasi', 'admin'), [...PERMISSION_KEYS]);
    ombor = ctx(user(ids.ombor, 'omborchi'), role('Omborchi'));
    boshliq = ctx(user(ids.boshliq, 'boshliq'), role("Sex boshlig'i"));
    usta = ctx(user(ids.usta, 'usta'), role('Usta / ishchi'));
    finUser = ctx(user(new Types.ObjectId().toString(), 'tayyor', 'user', fin), role("Sex boshlig'i"));

    await m.Branch.create([{ _id: raw, name: 'Xom ashyo', active: true, isMain: true }, { _id: fin, name: 'Tayyor mahsulot', active: true }]);
    await m.User.create([
      { _id: ids.usta, username: 'usta', fullName: 'Usta Ali', password: 'x', role: 'user', branchId: raw, active: true },
      { _id: ids.usta2, username: 'usta2', fullName: 'Usta Vali', password: 'x', role: 'user', branchId: raw, active: true },
    ]);
    const sup = await m.Supplier.create({ name: 'Un zavodi', createdBy: 'egasi' });
    supplierId = String(sup._id);

    const mk = (over: Record<string, unknown>) => m.Product.create({
      productId: `PRD-${Math.random().toString(36).slice(2, 9).toUpperCase()}`,
      imei: `SKU-${Math.random().toString(36).slice(2, 10)}`, salePrice: 0, branchId: raw, status: 'in_stock', trackQuantity: true, soldQuantity: 0, ...over,
    });
    const un = await mk({ name: 'Un', unit: 'kg', quantity: 100, purchasePrice: 7000, purchaseUnit: 'qop', purchaseFactor: 50, barcode: '4780000000017' });
    const shakar = await mk({ name: 'Shakar', unit: 'kg', quantity: 20, purchasePrice: 12000 });
    const non = await mk({ name: 'Non', unit: 'dona', quantity: 1, purchasePrice: 0, salePrice: 6000 });
    const xizmat = await mk({ name: 'Yetkazish', kind: 'service', trackQuantity: false, quantity: 1, purchasePrice: 0 });
    Object.assign(P, { un: String(un._id), shakar: String(shakar._id), non: String(non._id), xizmat: String(xizmat._id) });
  });

  afterAll(async () => {
    await conn?.dropDatabase();
    await conn?.close();
  });

  /* ───────────── texkarta ───────────── */

  it('texkarta: xarid birligida kiritish (0,08 qop = 4 kg), barqaror kod, xizmat — rad', async () => {
    const bad = await recipes.saveRecipe(boshliq, { name: 'Non', outputProductId: P.non, outputQty: 10, items: [{ productId: P.xizmat, qty: 1 }] });
    expect(bad).toMatchObject({ ok: false, code: 'notCountable' });
    const self = await recipes.saveRecipe(boshliq, { name: 'Non', outputProductId: P.non, outputQty: 10, items: [{ productId: P.non, qty: 1 }] });
    expect(self).toMatchObject({ ok: false, code: 'selfComponent' });
    const noPerm = await recipes.saveRecipe(usta, { name: 'Non', outputProductId: P.non, outputQty: 10, items: [{ productId: P.un, qty: 4 }] });
    expect(noPerm).toMatchObject({ ok: false, code: 'noPermission', status: 403 });

    const r = await recipes.saveRecipe(boshliq, {
      name: 'Non (oddiy)', outputProductId: P.non, outputQty: 10,
      items: [{ productId: P.un, qty: 0.08, unit: 'qop', lossPct: 5 }, { productId: P.shakar, qty: 0.5 }],
      operations: [{ name: 'Xamir', rate: 500 }, { name: 'Pishirish', rate: 300 }],
      overheadPerUnit: 200,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    recipeId = r.data.recipe.id;
    expect(r.data.recipe.version).toBe(1);
    expect(r.data.recipe.items[0]).toMatchObject({ name: 'Un', qty: 4, unit: 'kg', lossPct: 5 });
    expect(r.data.recipe.laborPerUnit).toBe(800);
    // itemCode = productId (barqaror kod) o'rnatildi
    const un = await doc(P.un);
    expect(un.itemCode).toBe(un.productId);
    expect(r.data.recipe.items[0].code).toBe(un.productId);
  });

  it('ehtiyoj hisobi: 25 non — 10,5 kg un, 1,25 kg shakar; tannarx — faqat huquq bilan', async () => {
    const req = await recipes.getRequirements(admin, { recipeId, qty: 25 });
    expect(req.ok).toBe(true);
    if (!req.ok) return;
    expect(req.data.branchId).toBe(String(raw));
    expect(req.data.lines.map((l) => [l.name, l.required, l.available, l.shortage])).toEqual([['Un', 10.5, 100, 0], ['Shakar', 1.25, 20, 0]]);
    expect(req.data.totals).toEqual({ materials: 73500 + 15000, labor: 20000, overhead: 5000, total: 113500, perUnit: 4540 });
    const noCost = await recipes.getRequirements(boshliq, { recipeId, qty: 25 });
    expect(noCost.ok && noCost.data.totals).toBeNull();
    expect(noCost.ok && noCost.data.lines[0].unitCost).toBeNull();
    const big = await recipes.getRequirements(admin, { recipeId, qty: 1000 });
    expect(big.ok && big.data.shortages).toBe(2);
  });

  /* ───────────── akt ───────────── */

  let orderId: string;

  it('akt ochish: idempotent clientId, reja, tayyor mahsulot boshqa omborga', async () => {
    const input = { recipeId, plannedQty: 25, toBranchId: String(fin), clientId: 'akt-0001-abcdef' };
    const a = await orders.createOrder(boshliq, input);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    orderId = a.data.order.id;
    expect(a.data.order.docNo).toMatch(/^P\d{8}-0001$/);
    expect(a.data.order).toMatchObject({ status: 'draft', fromBranchName: 'Xom ashyo', toBranchName: 'Tayyor mahsulot', cost: null });
    expect(a.data.order.materials.map((x) => [x.name, x.plannedQty, x.actualQty])).toEqual([['Un', 10.5, 10.5], ['Shakar', 1.25, 1.25]]);
    expect(a.data.order.labor.map((l) => [l.operation, l.amount])).toEqual([['Xamir', 12500], ['Pishirish', 7500]]);
    const again = await orders.createOrder(boshliq, input);
    expect(again).toMatchObject({ ok: true, data: { existing: true, order: { id: orderId } } });
    expect(await m.ProductionOrder.countDocuments()).toBe(1);
  });

  it('haqiqiy sarfni tuzatish va boshlash', async () => {
    const o = await orders.getOrder(boshliq, orderId);
    if (!o.ok) throw new Error('order');
    const unLine = o.data.order.materials.find((x) => x.name === 'Un')!;
    const u = await orders.updateOrder(boshliq, orderId, { materials: [{ id: unLine.id, actualQty: 11 }] });
    expect(u.ok).toBe(true);
    if (!u.ok) return;
    expect(u.data.order.materials.find((x) => x.name === 'Un')).toMatchObject({ actualQty: 11, plannedQty: 10.5, variance: 0.5 });
    const st = await orders.startOrder(boshliq, orderId);
    expect(st).toMatchObject({ ok: true, data: { order: { status: 'in_progress' } } });
    expect(await orders.startOrder(boshliq, orderId)).toMatchObject({ ok: false, code: 'badTransition' });
  });

  it('«bajarildi»: xom ashyo chiqadi, tayyor mahsulot yaratiladi, tannarx, brak hujjati', async () => {
    const r = await orders.completeOrder(boshliq, orderId, { producedQty: 24, scrapQty: 1 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const o = r.data.order;
    expect(o.status).toBe('done');
    expect(o.cost).toBeNull(); // boshliqda tannarx huquqi yo'q
    expect(await avail(P.un)).toBe(89);
    expect(await avail(P.shakar)).toBe(18.75);
    const unDoc = await doc(P.un);
    expect(unDoc.soldQuantity).toBe(0); // sarf — sotuv emas
    expect(unDoc.history.at(-1)).toMatchObject({ action: 'consumed' });

    // Tayyor mahsulot — tayyor mahsulot omborida YANGI hujjat, o'sha barqaror kod bilan
    expect(r.data.createdOutput).toBe(true);
    const out = await doc(r.data.outputProductId!);
    const tmpl = await doc(P.non);
    expect(String(out.branchId)).toBe(String(fin));
    expect(out.itemCode).toBe(tmpl.itemCode);
    expect(out.productId).not.toBe(tmpl.productId);
    expect(out).toMatchObject({ name: 'Non', quantity: 24, unit: 'dona', salePrice: 6000, trackQuantity: true });
    // Tannarx: 11×7000 + 1,25×12000 = 92000; ish haqi (500+300)×24 = 19200; ustama 200×24 = 4800 → 116000 / 25 = 4640
    expect(out.purchasePrice).toBe(4640);
    const full = await orders.getOrder(admin, orderId);
    expect(full.ok && full.data.order.cost).toEqual({ materials: 92000, labor: 19200, overhead: 4800, total: 116000, unitCost: 4640, scrap: 4640 });
    expect(full.ok && full.data.order.materials.find((x) => x.name === 'Un')).toMatchObject({ unitCost: 7000, cost: 77000 });
    // Brak — zarar hujjati
    const adj = await m.StockAdjustment.findOne({ reason: 'production_scrap' }).lean();
    expect(adj).toMatchObject({ type: 'writeoff', totalCost: 4640, items: [{ name: 'Non', qty: 1, purchasePrice: 4640 }] });
    expect(full.ok && full.data.order.scrapDocNo).toBe(adj.docNo);
    // Ikkinchi marta — yo'q
    expect(await orders.completeOrder(boshliq, orderId, { producedQty: 24 })).toMatchObject({ ok: false, code: 'badTransition' });
    expect(await avail(P.un)).toBe(89);
  });

  it('ikkinchi partiya: mavjud tayyor mahsulotga o\'rtacha tannarx bilan kirim', async () => {
    const a = await orders.createOrder(admin, { recipeId, plannedQty: 10, toBranchId: String(fin) });
    if (!a.ok) throw new Error(a.error);
    const r = await orders.completeOrder(admin, a.data.order.id, { producedQty: 10 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.createdOutput).toBe(false);
    // 4 kg × 1,05 = 4,2 kg un; 0,5 kg shakar → 29400 + 6000 + 8000 + 2000 = 45400 / 10 = 4540
    expect(r.data.order.cost).toMatchObject({ total: 45400, unitCost: 4540 });
    const out = await doc(r.data.outputProductId!);
    expect(out.quantity).toBe(34);
    expect(out.purchasePrice).toBe(Math.round((24 * 4640 + 10 * 4540) / 34)); // 4611
  });

  it('yetmasa — aniq ro\'yxat, hech narsa yozilmaydi', async () => {
    const a = await orders.createOrder(admin, { recipeId, plannedQty: 1000 });
    if (!a.ok) throw new Error(a.error);
    const before = [await avail(P.un), await avail(P.shakar)];
    const r = await orders.completeOrder(admin, a.data.order.id, { producedQty: 1000 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('outOfStock');
    expect(r.status).toBe(409);
    expect((r.details?.shortages as { name: string }[]).map((x) => x.name)).toEqual(['Un', 'Shakar']);
    expect([await avail(P.un), await avail(P.shakar)]).toEqual(before);
    const o = await m.ProductionOrder.findById(a.data.order.id).lean();
    expect(o.status).toBe('draft');
    expect(o.postingAt).toBeUndefined();
    expect((await orders.cancelOrder(admin, a.data.order.id, 'xato')).ok).toBe(true);
  });

  it('parallel «bajarildi» — xom ashyo bir marta chiqadi', async () => {
    const a = await orders.createOrder(admin, { recipeId, plannedQty: 10 });
    if (!a.ok) throw new Error(a.error);
    const before = await avail(P.un);
    const [x, y] = await Promise.all([
      orders.completeOrder(admin, a.data.order.id, { producedQty: 10 }),
      orders.completeOrder(admin, a.data.order.id, { producedQty: 10 }),
    ]);
    expect([x.ok, y.ok].filter(Boolean)).toHaveLength(1);
    const lost = [x, y].find((r) => !r.ok) as { code: string };
    expect(['locked', 'badTransition', 'conflict']).toContain(lost.code);
    expect(await avail(P.un)).toBe(Math.round((before - 4.2) * 1000) / 1000);
  });

  it('filial doirasi: boshqa ombor xom ashyosidan akt ochib bo\'lmaydi', async () => {
    const r = await orders.createOrder(finUser, { recipeId, plannedQty: 1, fromBranchId: String(raw) });
    expect(r).toMatchObject({ ok: false, code: 'badBranch' });
    // Xom ashyo ombori xodimi akt ro'yxatida faqat o'z aktlarini ko'radi (tayyor mahsulot ombori ham — tegishli aktlar)
    const list = await orders.listOrders(finUser, {});
    expect(list.ok && list.data.items.every((o) => o.toBranchName === 'Tayyor mahsulot')).toBe(true);
  });

  /* ───────────── texkarta versiyasi ───────────── */

  it('texkarta versiyasi: tarkib o\'zgarsa +1, eski akt nusxasi o\'zgarmaydi, eskirgan versiya — conflict', async () => {
    const base = { name: 'Non (oddiy)', outputProductId: P.non, outputQty: 10, operations: [{ name: 'Xamir', rate: 500 }, { name: 'Pishirish', rate: 300 }], overheadPerUnit: 200 };
    const v2 = await recipes.saveRecipe(boshliq, { ...base, id: recipeId, expectedVersion: 1, items: [{ productId: P.un, qty: 4.2, lossPct: 5 }, { productId: P.shakar, qty: 0.5 }] });
    expect(v2).toMatchObject({ ok: true, data: { versionBumped: true, recipe: { version: 2 } } });
    const rename = await recipes.saveRecipe(boshliq, { ...base, id: recipeId, name: 'Non', items: [{ productId: P.un, qty: 4.2, lossPct: 5 }, { productId: P.shakar, qty: 0.5 }] });
    expect(rename).toMatchObject({ ok: true, data: { versionBumped: false, recipe: { version: 2, name: 'Non' } } });
    const stale = await recipes.saveRecipe(boshliq, { ...base, id: recipeId, expectedVersion: 1, items: [{ productId: P.un, qty: 5 }] });
    expect(stale).toMatchObject({ ok: false, code: 'conflict' });
    const got = await recipes.getRecipe(admin, recipeId);
    expect(got.ok && got.data.recipe.versions?.map((v) => v.version)).toEqual([1]);
    expect(got.ok && got.data.cost).toMatchObject({ branchId: String(raw), missing: [] });
    const old = await orders.getOrder(admin, orderId);
    expect(old.ok && old.data.order.recipe.version).toBe(1);
    // Arxiv — yangi akt ochilmaydi
    expect((await recipes.setRecipeActive(boshliq, recipeId, false)).ok).toBe(true);
    expect(await orders.createOrder(boshliq, { recipeId, plannedQty: 1 })).toMatchObject({ ok: false, code: 'recipeInactive' });
    expect((await recipes.setRecipeActive(boshliq, recipeId, true)).ok).toBe(true);
  });

  /* ───────────── kirim akti ───────────── */

  it('kirim: 2 qop = 100 kg, o\'rtacha tannarx, yetkazib beruvchi qarzi va to\'lov', async () => {
    const unBefore = await doc(P.un);
    const stockBefore = await avail(P.un);
    const r = await receipts.saveReceipt(admin, null, {
      supplierId, supplierInvoiceNo: 'NK-77', paidNow: 300_000, clientId: 'kirim-0001-abcdef',
      lines: [{ productId: P.un, qty: 2, unit: 'qop', price: 400_000 }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.receipt.docNo).toMatch(/^K\d{8}-0001$/);
    expect(r.data.receipt.lines[0]).toMatchObject({ qty: 2, unit: 'qop', factor: 50, baseQty: 100, baseUnit: 'kg', price: 400000, amount: 800000 });
    expect(r.data.receipt).toMatchObject({ total: 800000, paidNow: 300000, debt: 500000, unpriced: 0 });
    const dup = await receipts.saveReceipt(admin, null, { supplierId, clientId: 'kirim-0001-abcdef', lines: [{ productId: P.un, qty: 1 }] });
    expect(dup).toMatchObject({ ok: true, data: { existing: true } });

    const post = await receipts.postReceipt(admin, r.data.receipt.id);
    expect(post.ok).toBe(true);
    const un = await doc(P.un);
    expect(await avail(P.un)).toBe(stockBefore + 100);
    expect(un.purchasePrice).toBe(Math.round((stockBefore * unBefore.purchasePrice + 100 * 8000) / (stockBefore + 100)));
    expect(un.history.at(-1)).toMatchObject({ action: 'restocked' });
    const entries = await m.SupplierEntry.find({ supplierId }).lean();
    expect(entries.map((e: { type: string; amount: number }) => [e.type, e.amount]).sort()).toEqual([['payment', 300000], ['purchase', 800000]]);
    expect(entries.every((e: { receiptId: unknown }) => String(e.receiptId) === r.data.receipt.id)).toBe(true);
    expect(sumSupplierEntries(entries)).toEqual({ purchased: 800000, paid: 300000, debt: 500000 });
    expect(await receipts.postReceipt(admin, r.data.receipt.id)).toMatchObject({ ok: false, code: 'badTransition' });

    const print = await receipts.receiptPrintData(admin, r.data.receipt.id);
    expect(print.ok && print.data).toMatchObject({ shop: 'Non sexi', supplier: { name: 'Un zavodi' }, warehouse: 'Xom ashyo', total: 800000, debt: 500000 });
  });

  it('omborchi: narxni ko\'rmaydi, narxsiz kirim post qilinmaydi; hisobchi narx kiritgach — qiladi', async () => {
    const r = await receipts.saveReceipt(ombor, null, { supplierId, lines: [{ productId: P.shakar, qty: 5, price: 1 }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.receipt.lines[0]).toMatchObject({ price: null, priced: false });
    expect(r.data.receipt.total).toBeNull();
    expect(await receipts.postReceipt(ombor, r.data.receipt.id)).toMatchObject({ ok: false, code: 'pricesRequired' });
    const priced = await receipts.saveReceipt(admin, r.data.receipt.id, { supplierId, lines: [{ productId: P.shakar, qty: 5, price: 11000 }] });
    expect(priced.ok).toBe(true);
    // Omborchi miqdorni o'zgartirsa ham narx saqlanadi
    const edited = await receipts.saveReceipt(ombor, r.data.receipt.id, { supplierId, lines: [{ productId: P.shakar, qty: 6 }] });
    expect(edited.ok && edited.data.receipt.unpriced).toBe(0);
    const before = await avail(P.shakar);
    expect((await receipts.postReceipt(ombor, r.data.receipt.id)).ok).toBe(true);
    expect(await avail(P.shakar)).toBe(before + 6);
  });

  it('boshqa omborga kirim — o\'sha kodli nusxa yaratiladi; ikkinchisi unga qo\'shiladi', async () => {
    const r = await receipts.saveReceipt(admin, null, { branchId: String(fin), lines: [{ productId: P.un, qty: 10, price: 9000 }] });
    if (!r.ok) throw new Error(r.error);
    const post = await receipts.postReceipt(admin, r.data.receipt.id);
    expect(post.ok).toBe(true);
    if (!post.ok) return;
    expect(post.data.created).toHaveLength(1);
    const copy = await doc(post.data.created[0]);
    const orig = await doc(P.un);
    expect(String(copy.branchId)).toBe(String(fin));
    expect(copy).toMatchObject({ itemCode: orig.itemCode, quantity: 10, purchasePrice: 9000, purchaseUnit: 'qop', purchaseFactor: 50, barcode: orig.barcode });
    expect(post.data.receipt.lines[0].productId).toBe(post.data.created[0]);
    const r2 = await receipts.saveReceipt(admin, null, { branchId: String(fin), lines: [{ productId: P.un, qty: 10, price: 10000 }] });
    if (!r2.ok) throw new Error(r2.error);
    const post2 = await receipts.postReceipt(admin, r2.data.receipt.id);
    expect(post2.ok && post2.data.created).toEqual([]);
    expect(await doc(post.data.created[0])).toMatchObject({ quantity: 20, purchasePrice: 9500 });
  });

  /* ───────────── xarid buyurtmasi ───────────── */

  it('PO: yuborish → qisman qabul → to\'liq qabul', async () => {
    const created = await pos.savePo(admin, null, { supplierId, lines: [{ productId: P.shakar, qty: 30, price: 11000 }] });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const poId = created.data.po.id;
    expect(created.data.po).toMatchObject({ status: 'draft', total: 330000 });
    expect((await pos.sendPo(admin, poId)).ok).toBe(true);

    const draft = await receipts.receiptDraftFromPo(ombor, poId);
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;
    expect(draft.data.receipt.lines[0]).toMatchObject({ qty: 30, priced: true, price: null }); // narx PO'dan, omborchiga yashirin
    const lineId = draft.data.receipt.lines[0].poLineId!;
    const part = await receipts.saveReceipt(ombor, draft.data.receipt.id, { lines: [{ productId: P.shakar, qty: 20, poLineId: lineId }] });
    expect(part.ok && part.data.receipt.unpriced).toBe(0);
    expect((await receipts.postReceipt(ombor, draft.data.receipt.id)).ok).toBe(true);
    let po = await pos.getPo(admin, poId);
    expect(po.ok && po.data.po).toMatchObject({ status: 'partial', lines: [{ receivedQty: 20, remaining: 10 }] });

    const rest = await receipts.receiptDraftFromPo(ombor, poId);
    if (!rest.ok) throw new Error(rest.error);
    expect(rest.data.receipt.lines[0].qty).toBe(10);
    expect((await receipts.postReceipt(ombor, rest.data.receipt.id)).ok).toBe(true);
    po = await pos.getPo(admin, poId);
    expect(po.ok && po.data.po.status).toBe('received');
    expect(await receipts.receiptDraftFromPo(ombor, poId)).toMatchObject({ ok: false, code: 'poClosed' });
    expect(await pos.cancelPo(admin, poId)).toMatchObject({ ok: false, code: 'badTransition' });
    const debt = sumSupplierEntries(await m.SupplierEntry.find({ supplierId }).lean());
    expect(debt.purchased).toBe(800000 + 66000 + 330000);
  });

  /* ───────────── ishbay ───────────── */

  it('ishbay: ishchi o\'zi uchun yozadi (narx texkartadan), boshqaga — yo\'q, idempotent', async () => {
    const r = await pw.logPiecework(usta, { productionOrderId: orderId, operation: 'xamir', qty: 24, rate: 99999, clientId: 'pw-0001-abcdef' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.entry).toMatchObject({ operation: 'Xamir', rate: 500, amount: 12000, status: 'logged', workerName: 'Usta Ali' });
    const dup = await pw.logPiecework(usta, { productionOrderId: orderId, operation: 'Xamir', qty: 24, clientId: 'pw-0001-abcdef' });
    expect(dup).toMatchObject({ ok: true, data: { existing: true, entry: { id: r.data.entry.id } } });
    expect(await pw.logPiecework(usta, { workerId: ids.usta2, operation: 'Xamir', qty: 1, rate: 100 })).toMatchObject({ ok: false, code: 'noPermission' });
    expect(await pw.logPiecework(usta, { operation: 'Yig\'ish', qty: 1 })).toMatchObject({ ok: false, code: 'rateRequired' });
    // Boshliq boshqa ishchi uchun yozadi
    const v = await pw.logPiecework(boshliq, { workerId: ids.usta2, operation: 'Qadoqlash', qty: 10, rate: 150 });
    expect(v.ok && v.data.entry.amount).toBe(1500);
    // Ishchi faqat o'z yozuvlarini ko'radi
    const mine = await pw.listPiecework(usta, {});
    expect(mine.ok && mine.data.items.map((e) => e.workerName)).toEqual(['Usta Ali']);
    const all = await pw.listPiecework(boshliq, {});
    expect(all.ok && all.data.total).toBe(2);
    // Ishchi narxni o'zgartira olmaydi
    expect(await pw.editPiecework(usta, { id: r.data.entry.id, rate: 1000 })).toMatchObject({ ok: false, code: 'noPermission' });
  });

  it('ishbay: tasdiqlash → to\'lov → kassa chiqimi «Ish haqi»; takror — o\'sha natija', async () => {
    const list = await pw.listPiecework(boshliq, { status: 'logged' });
    if (!list.ok) throw new Error(list.error);
    const ali = list.data.items.find((e) => e.workerId === ids.usta)!;
    expect(await pw.payPiecework(boshliq, { workerId: ids.usta })).toMatchObject({ ok: false, code: 'nothingToPay' });
    const ap = await pw.approvePiecework(boshliq, list.data.items.map((e) => e.id));
    expect(ap).toMatchObject({ ok: true, data: { updated: 2, skipped: 0 } });
    expect(await pw.approvePiecework(boshliq, [ali.id])).toMatchObject({ ok: true, data: { updated: 0, skipped: 1 } });

    const pay = await pw.payPiecework(boshliq, { workerId: ids.usta, clientId: 'pay-0001-abcdef' });
    expect(pay).toMatchObject({ ok: true, data: { count: 1, amount: 12000, workerName: 'Usta Ali', existing: false } });
    if (!pay.ok) return;
    const cf = await m.CashFlow.findById(pay.data.cashFlowId).lean();
    expect(cf).toMatchObject({ type: 'expense', amount: 12000, category: 'Ish haqi', recordedBy: 'boshliq' });
    expect(await m.FinanceCategory.exists({ name: 'Ish haqi', type: 'expense' })).toBeTruthy();
    const again = await pw.payPiecework(boshliq, { workerId: ids.usta, clientId: 'pay-0001-abcdef' });
    expect(again).toMatchObject({ ok: true, data: { existing: true, amount: 12000 } });
    expect(await m.CashFlow.countDocuments()).toBe(1);
    const entry = await m.PieceworkEntry.findById(ali.id).lean();
    expect(entry).toMatchObject({ status: 'paid', paidBy: 'boshliq' });
    expect(String(entry.cashFlowId)).toBe(pay.data.cashFlowId);

    const sum = await pw.pieceworkSummary(boshliq, {});
    expect(sum.ok && sum.data.totals).toMatchObject({ paid: { amount: 12000 }, approved: { amount: 1500 }, due: 1500 });
    const own = await pw.pieceworkSummary(usta, {});
    expect(own.ok && own.data.workers.map((w) => w.workerId)).toEqual([ids.usta]);
  });

  /* ───────────── minimal qoldiq va ombor sozlamalari ───────────── */

  it('minimal qoldiq va xarid birligi sozlamasi', async () => {
    const s = await catalog.setStockSettings(admin, { productId: P.shakar, minStock: 1000, purchaseUnit: 'qop', purchaseFactor: 50 });
    expect(s.ok).toBe(true);
    expect(await catalog.setStockSettings(admin, { productId: P.shakar, purchaseUnit: 'kg', purchaseFactor: 2 })).toMatchObject({ ok: false, code: 'badUnit' });
    expect(await catalog.setStockSettings(admin, { productId: P.shakar, purchaseUnit: 'qop', purchaseFactor: 1 })).toMatchObject({ ok: false, code: 'badFactor' });
    const low = await catalog.lowStockList(admin, {});
    expect(low.ok && low.data.items.map((x) => x.name)).toEqual(['Shakar']);
    expect(await catalog.setStockSettings(ombor, { productId: P.shakar, minStock: 1 })).toMatchObject({ ok: false, code: 'noPermission' });
    const opt = await catalog.productOptions(ombor, { q: 'shak' });
    expect(opt.ok && opt.data.items[0]).toMatchObject({ name: 'Shakar', purchaseUnit: 'qop', purchaseFactor: 50, cost: null, minStock: 1000 });
    // Xarid birligi texkarta nusxalariga ham (admin — barcha filiallardagi shu kodli hujjatlar)
    const unCopy = await m.Product.findOne({ branchId: fin, name: 'Un' }).lean();
    const r = await catalog.setStockSettings(admin, { productId: P.un, purchaseUnit: 'qop', purchaseFactor: 25 });
    expect(r.ok && r.data.updatedCopies).toBe(1);
    expect((await doc(String(unCopy._id))).purchaseFactor).toBe(25);
  });

  it('modul o\'chiq bo\'lsa — moduleOff', async () => {
    const off = { ...admin, features: { ...features, piecework: false, production: false } };
    expect(await pw.listPiecework(off, {})).toMatchObject({ ok: false, code: 'moduleOff', status: 403 });
    expect(await orders.listOrders(off, {})).toMatchObject({ ok: false, code: 'moduleOff' });
  });
});

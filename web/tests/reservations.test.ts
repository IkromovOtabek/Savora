/**
 * Restoran bronlari — haqiqiy MongoDB bilan (MONGO_TEST_URI berilsa):
 *   MONGO_TEST_URI=mongodb://127.0.0.1:27019 npx vitest run tests/reservations.test.ts
 * Bo'sh stollar (mosi birinchi), ustma-ust qoidasi (parallel ham), o'tgan vaqt, mijoz (telefon bo'yicha topish/yaratish),
 * oldindan taomlar (menyu, stop-list, modifikator), huquqlar (ofitsant yarata olmaydi, «Keldi» qila oladi), filial chegarasi,
 * «Keldi» → taomli buyurtma (band stol rad, takror — o'sha buyurtma, stop-listdagi taom tashlab ketiladi), bekor/«Kelmadi»,
 * tahrir, eslatma tanlovi (oyna, remindedAt), upcomingByTable.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mongoose, { Types } from 'mongoose';

vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn(async () => {}) }));
vi.mock('@/lib/onboarding', () => ({ markOnboardingStep: vi.fn(async () => {}) }));
vi.mock('@/lib/shopNotify', () => ({ notifyNewSale: vi.fn(async () => {}), salePayLabel: () => 'naqd' }));
vi.mock('@/lib/notify', () => ({ notify: vi.fn(async () => {}) }));

const URI = process.env.MONGO_TEST_URI;

describe.skipIf(!URI)('restoran bronlari (MongoDB)', () => {
  let conn: mongoose.Connection;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let m: any;
  let res: typeof import('@/lib/restaurant/reservations');
  let rem: typeof import('@/lib/restaurant/reservationReminders');
  let rules: typeof import('@/lib/restaurant/reservationRules');
  let ops: typeof import('@/lib/restaurant/ops');
  let setup: typeof import('@/lib/restaurant/setup');
  let d: import('@/lib/i18n/dict').Dict;
  let features: import('@/lib/features').OrgFeatures;
  type PK = import('@/lib/permissions').PermissionKey;

  const branchId = new Types.ObjectId();
  const otherBranch = new Types.ObjectId();
  const ids = { admin: new Types.ObjectId().toString(), kassir: new Types.ObjectId().toString(), ali: new Types.ObjectId().toString(), boshqa: new Types.ObjectId().toString() };
  const user = (id: string, username: string, role: 'admin' | 'user' = 'user', branch = branchId) =>
    ({ id, username, role, tokenVersion: 0, dbName: 'test', organizationId: 'org', ...(role === 'user' ? { branchId: String(branch) } : {}) });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctx = (u: ReturnType<typeof user>, perms: PK[]): any => ({ user: u, orgId: 'a'.repeat(24), orgSlug: 'osh', m, perms: new Set(perms), features, d });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let admin: any, kassir: any, ali: any, boshqa: any;

  const P: Record<string, string> = {};
  let optKatta = '';
  let t5 = '', t6 = '', t7 = '', tOther = '';
  // Simulyatsiya qilingan «hozir»: ertangi kun 12:00 (Toshkent)
  let DAY = '';
  let NOW: Date;
  const at = (time: string, day = DAY) => rules.reservationStart(day, time)!;
  /** Istalgan daqiqa (15 qadamsiz) — simulyatsiya qilingan «hozir» va sinov yozuvlari uchun */
  const clock = (time: string, day = DAY) => {
    const [h, mm] = time.split(':').map(Number);
    return new Date(rules.dayRange(day).start.getTime() + (h * 60 + mm) * 60_000);
  };

  const base = (over: Record<string, unknown> = {}) => ({
    tableId: t5, date: DAY, time: '19:00', durationMin: 120, guests: 3, customerName: 'Aziz', customerPhone: '+998 90 111 22 33', ...over,
  });

  beforeAll(async () => {
    conn = await mongoose.createConnection(`${URI}/savora_res_test_${Date.now()}`).asPromise();
    const s = {
      Order: (await import('@/lib/models/tenant/Order')).orderSchema,
      Table: (await import('@/lib/models/tenant/Table')).tableSchema,
      Hall: (await import('@/lib/models/tenant/Hall')).hallSchema,
      KitchenStation: (await import('@/lib/models/tenant/KitchenStation')).kitchenStationSchema,
      PrintJob: (await import('@/lib/models/tenant/PrintJob')).printJobSchema,
      Product: (await import('@/lib/models/tenant/Product')).productSchema,
      Sale: (await import('@/lib/models/tenant/Sale')).saleSchema,
      User: (await import('@/lib/models/tenant/User')).userSchema,
      Branch: (await import('@/lib/models/tenant/Branch')).branchSchema,
      ShopSettings: (await import('@/lib/models/tenant/ShopSettings')).shopSettingsSchema,
      ProductCategory: (await import('@/lib/models/tenant/ProductCategory')).productCategorySchema,
      Customer: (await import('@/lib/models/tenant/Customer')).customerSchema,
      Reservation: (await import('@/lib/models/tenant/Reservation')).reservationSchema,
    };
    m = Object.fromEntries(Object.entries(s).map(([k, schema]) => [k, conn.model(k, schema as mongoose.Schema)]));
    await Promise.all(Object.values(m).map((M) => (M as mongoose.Model<unknown>).init()));
    res = await import('@/lib/restaurant/reservations');
    rem = await import('@/lib/restaurant/reservationReminders');
    rules = await import('@/lib/restaurant/reservationRules');
    ops = await import('@/lib/restaurant/ops');
    setup = await import('@/lib/restaurant/setup');
    d = (await import('@/lib/i18n/dict')).getDictionary('uz');
    const { resolveOrgFeatures } = await import('@/lib/features');
    const { PERMISSION_KEYS } = await import('@/lib/permissions');
    features = resolveOrgFeatures({ plan: { tier: 'pro', maxFilial: 3, maxUsers: 10 }, businessType: 'restaurant' });
    DAY = rules.addDays(rules.tashkentDay(new Date()), 1);
    NOW = at('12:00');

    admin = ctx(user(ids.admin, 'egasi', 'admin'), [...PERMISSION_KEYS]);
    kassir = ctx(user(ids.kassir, 'kassir'), ['order.create', 'order.viewAll', 'reservation.manage', 'sale.create']);
    ali = ctx(user(ids.ali, 'ali'), ['order.create', 'tasks.view']);
    boshqa = ctx(user(ids.boshqa, 'boshqa', 'user', otherBranch), ['order.create', 'order.viewAll', 'reservation.manage']);

    await m.Branch.create([{ _id: branchId, name: 'Chilonzor', active: true }, { _id: otherBranch, name: 'Yunusobod', active: true }]);
    await m.User.create([
      { _id: ids.kassir, username: 'kassir', fullName: 'Kassir Malika', password: 'x', role: 'user', branchId, active: true },
      { _id: ids.ali, username: 'ali', password: 'x', role: 'user', branchId, active: true },
    ]);
    await m.ShopSettings.create({ key: 'main', menuVersion: 1, restaurant: { serviceChargePct: 10 } });

    const hall = await setup.saveHall(admin, { name: 'Asosiy zal', branchId: String(branchId) });
    const hallId = hall.ok ? hall.data.id : '';
    await setup.createTablesRange(admin, { hallId, from: 5, to: 7, seats: 4 });
    const tables = await m.Table.find({ branchId }).sort({ number: 1 }).lean();
    [t5, t6, t7] = tables.map((t: { _id: unknown }) => String(t._id));
    await m.Table.updateOne({ _id: t6 }, { $set: { seats: 2 } });
    await m.Table.updateOne({ _id: t7 }, { $set: { seats: 8 } });
    const hall2 = await setup.saveHall(admin, { name: 'Terrasa', branchId: String(otherBranch) });
    await setup.createTablesRange(admin, { hallId: hall2.ok ? hall2.data.id : '', from: 1, to: 1, seats: 4 });
    tOther = String((await m.Table.findOne({ branchId: otherBranch }).lean())._id);

    const mk = (over: Record<string, unknown>) => m.Product.create({
      imei: `P${Math.random().toString(36).slice(2, 10)}`, purchasePrice: 1000, salePrice: 1000, branchId, status: 'in_stock', ...over,
    });
    const guruch = await mk({ name: 'Guruch', unit: 'kg', trackQuantity: true, quantity: 20, menuItem: false });
    const osh = await mk({ name: 'Osh', kind: 'bundle', salePrice: 45000, menuItem: true, bundleItems: [{ productId: guruch._id, qty: 0.3 }] });
    const non = await mk({ name: 'Non', kind: 'service', salePrice: 3000, purchasePrice: 0, menuItem: true });
    const somsa = await mk({ name: 'Somsa', trackQuantity: true, quantity: 50, salePrice: 8000, menuItem: true });
    Object.assign(P, { guruch: String(guruch._id), osh: String(osh._id), non: String(non._id), somsa: String(somsa._id) });
    expect((await setup.updateMenuItem(admin, P.osh, {
      modifierGroups: [{ name: 'Porsiya', required: true, options: [{ name: 'Kichik', price: 0 }, { name: 'Katta', price: 8000 }] }],
    })).ok).toBe(true);
    optKatta = String((await m.Product.findById(P.osh).lean()).modifierGroups[0].options[1]._id);
  });

  afterAll(async () => {
    await conn?.dropDatabase();
    await conn?.close();
  });

  it('bo\'sh stollar: mehmonlarga mosi birinchi (kichigi oldin), sig\'maydigani oxirida; band vaqt chiqarib tashlanadi', async () => {
    const free = await res.freeTables(kassir, undefined, at('19:00'), 120, 3, { now: NOW });
    expect(free.ok && free.data.map((t) => [t.number, t.fits])).toEqual([[5, true], [7, true], [6, false]]);
    // Ofitsant bo'sh stollar (forma) ni so'ray olmaydi
    expect(await res.freeTables(ali, undefined, at('19:00'), 120, 3, { now: NOW })).toMatchObject({ ok: false, code: 'noPermission' });
  });

  it('yaratish: mijoz telefon bo\'yicha yaratiladi/topiladi, taomlar (modifikator), ustma-ust rad, tutashgan — mumkin', async () => {
    const r1 = await res.createReservation(kassir, base({ items: [{ productId: P.osh, qty: 2, optionIds: [optKatta], note: 'piyozsiz' }, { productId: P.non, qty: 2 }], note: "tug'ilgan kun" }), NOW);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(r1.data.reservation).toMatchObject({
      tableNumber: 5, time: '19:00', endTime: '21:00', day: DAY, guests: 3, status: 'booked', customerName: 'Aziz',
      customerPhone: '+998 90 111 22 33', hallName: 'Asosiy zal', note: "tug'ilgan kun", createdBy: 'Kassir Malika',
    });
    expect(r1.data.reservation.items).toEqual([
      { productId: P.osh, name: 'Osh', qty: 2, note: 'piyozsiz', optionIds: [optKatta], options: ['Katta'] },
      { productId: P.non, name: 'Non', qty: 2, note: null, optionIds: [], options: [] },
    ]);
    const customers = await m.Customer.find({}).lean();
    expect(customers).toHaveLength(1);
    expect(r1.data.reservation.customerId).toBe(String(customers[0]._id));

    // Kesishgan vaqt — rad (aniq xabar bilan); tutashgan (21:00) — mumkin; boshqa formatdagi shu telefon — o'sha mijoz
    const clash = await res.createReservation(kassir, base({ time: '20:30', customerName: 'Bobur', customerPhone: '+998 91 000 00 01' }), NOW);
    expect(clash).toMatchObject({ ok: false, code: 'reservationOverlap', status: 409 });
    expect(!clash.ok && clash.error).toContain('19:00–21:00');
    const r2 = await res.createReservation(kassir, base({ time: '21:00', customerName: 'Aziz aka', customerPhone: '901112233' }), NOW);
    expect(r2.ok && r2.data.reservation.customerId).toBe(String(customers[0]._id));
    expect(await m.Customer.countDocuments()).toBe(1);
    // Mavjud mijoz ismi ustidan yozilmaydi
    expect((await m.Customer.findById(customers[0]._id).lean()).fullName).toBe('Aziz');

    // Bo'sh stollar endi 5-stolsiz (19:00–21:00), 21:00 dan — 5-stol yana band (r2)
    const free = await res.freeTables(kassir, undefined, at('19:30'), 60, 2, { now: NOW });
    expect(free.ok && free.data.map((t) => t.number)).toEqual([6, 7]);
  });

  it('kirish qoidalari: o\'tgan vaqt, taom menyuda/stop-listda, majburiy modifikator, mijoz, telefon', async () => {
    expect(await res.createReservation(kassir, base({ tableId: t6, time: '11:00' }), NOW)).toMatchObject({ ok: false, code: 'reservationPast' });
    // 15 daqiqa chegarasi ichida — mumkin (hozirgina kelgan mijoz)
    const grace = await res.createReservation(kassir, base({ tableId: t6, time: '11:45', durationMin: 30, guests: 2 }), NOW);
    expect(grace.ok).toBe(true);
    expect(await res.createReservation(kassir, base({ tableId: t6, time: '13:00', items: [{ productId: P.guruch, qty: 1 }] }), NOW)).toMatchObject({ ok: false, code: 'productNotFound' });
    expect(await res.createReservation(kassir, base({ tableId: t6, time: '13:00', items: [{ productId: P.osh, qty: 1 }] }), NOW)).toMatchObject({ ok: false, code: 'badModifiers' });
    expect(await res.createReservation(kassir, base({ tableId: t6, time: '13:00', customerName: '', customerPhone: '' }), NOW)).toMatchObject({ ok: false, code: 'customerRequired' });
    expect(await res.createReservation(kassir, base({ tableId: t6, time: '13:00', customerPhone: '12345' }), NOW)).toMatchObject({ ok: false, code: 'badPhone' });
    expect(await res.createReservation(kassir, base({ tableId: t6, time: '13:10' }), NOW)).toMatchObject({ ok: false, code: 'badTime' });
    expect(await res.createReservation(kassir, base({ tableId: t6, time: '13:00', customerId: new Types.ObjectId().toString() }), NOW)).toMatchObject({ ok: false, code: 'customerNotFound' });
    await m.Product.updateOne({ _id: P.somsa }, { $set: { stopListed: true } });
    expect(await res.createReservation(kassir, base({ tableId: t6, time: '13:00', items: [{ productId: P.somsa, qty: 1 }] }), NOW)).toMatchObject({ ok: false, code: 'stopListed' });
    await m.Product.updateOne({ _id: P.somsa }, { $set: { stopListed: false } });
  });

  it('zod: NoSQL injection va noto\'g\'ri maydonlar o\'tmaydi', async () => {
    const { reservationSchemas } = await import('@/lib/restaurant/reservationInputs');
    const { parseInput } = await import('@/lib/validation');
    const s = reservationSchemas(d);
    expect(parseInput(s.save, { ...base(), tableId: { $ne: null } }).ok).toBe(false);
    expect(parseInput(s.save, { ...base(), customerId: { $gt: '' } }).ok).toBe(false);
    expect(parseInput(s.save, { ...base(), time: '25:00' }).ok).toBe(false);
    expect(parseInput(s.save, { ...base(), date: '2026-02-31' }).ok).toBe(false);
    expect(parseInput(s.save, { ...base(), durationMin: 20 }).ok).toBe(false);
    expect(parseInput(s.save, { ...base(), guests: 0 }).ok).toBe(false);
    const okParse = parseInput(s.save, { ...base(), durationMin: '' });
    expect(okParse.ok && okParse.data.durationMin).toBe(120);
    // Operator obyekti matnga aylanadi (so'rovga obyekt bo'lib tushmaydi), qidiruvda esa regex belgilari ekranlanadi
    const q = parseInput(s.search, { q: { $regex: '.*' } });
    expect(q.ok && typeof q.data.q).toBe('string');
    expect(await res.searchReservationCustomers(kassir, '.*')).toMatchObject({ ok: true, data: [] });
  });

  it('huquqlar: ofitsant yarata/bekor qila olmaydi, ro\'yxatni ko\'radi; filial chegarasi', async () => {
    expect(await res.createReservation(ali, base({ tableId: t7, time: '13:00' }), NOW)).toMatchObject({ ok: false, code: 'noPermission' });
    const list = await res.listReservations(ali, { date: DAY, now: NOW });
    expect(list.ok && list.data.items.map((r) => `${r.tableNumber} ${r.time}`)).toEqual(['6 11:45', '5 19:00', '5 21:00']);
    expect(list.ok && list.data.can).toEqual({ manage: false, seat: true });
    const id = list.ok ? list.data.items[1].id : '';
    expect(await res.cancelReservation(ali, id, '', NOW)).toMatchObject({ ok: false, code: 'noPermission' });
    expect(await res.searchReservationCustomers(ali, 'Aziz')).toMatchObject({ ok: false, code: 'noPermission' });
    // Boshqa filial xodimi: bu filial broni ko'rinmaydi, stoliga yozolmaydi, filialni so'rasa — rad
    expect(await res.getReservation(boshqa, id)).toMatchObject({ ok: false, code: 'reservationNotFound' });
    expect(await res.cancelReservation(boshqa, id, '', NOW)).toMatchObject({ ok: false, code: 'reservationNotFound' });
    expect(await res.seatReservation(boshqa, id, NOW)).toMatchObject({ ok: false, code: 'reservationNotFound' });
    expect(await res.createReservation(boshqa, base({ tableId: t7, time: '13:00' }), NOW)).toMatchObject({ ok: false, code: 'tableNotFound' });
    expect(await res.listReservations(boshqa, { branchId: String(branchId) })).toMatchObject({ ok: false, code: 'badBranch' });
    const own = await res.createReservation(boshqa, base({ tableId: tOther, time: '13:00' }), NOW);
    expect(own.ok).toBe(true);
    // Modul o'chiq — hech narsa
    const off = { ...kassir, features: { ...features, tables: false } };
    expect(await res.listReservations(off, { now: NOW })).toMatchObject({ ok: false, code: 'moduleOff' });
    // Mijoz qidiruvi: ism va telefon raqamlari bo'yicha (format farqi bilan)
    const byName = await res.searchReservationCustomers(kassir, 'azi');
    expect(byName.ok && byName.data.map((c) => c.name)).toContain('Aziz');
    const byPhone = await res.searchReservationCustomers(kassir, '90 111 22');
    expect(byPhone.ok && byPhone.data.length).toBe(1);
  });

  it('«Keldi»: taomli buyurtma ochiladi (new), takror — o\'sha buyurtma; juda erta — rad; band stol — rad', async () => {
    const list = await res.listReservations(kassir, { date: DAY, now: NOW });
    const r19 = list.ok ? list.data.items.find((r) => r.time === '19:00')! : null!;
    // 7 soat oldin — juda erta
    expect(await res.seatReservation(ali, r19.id, NOW)).toMatchObject({ ok: false, code: 'reservationTooEarly' });
    const seatNow = clock('18:50');
    const seated = await res.seatReservation(ali, r19.id, seatNow);
    expect(seated.ok).toBe(true);
    if (!seated.ok) return;
    expect(seated.data.skipped).toEqual([]);
    expect(seated.data.reservation).toMatchObject({ status: 'seated', orderId: seated.data.orderId, seatedBy: 'ali' });
    expect(seated.data.order).toMatchObject({ tableNumber: 5, guests: 3, status: 'open', waiterName: 'ali' });
    const items = seated.data.order!.items.map((i) => [i.displayName, i.qty, i.status, i.note]);
    expect(items).toEqual([['Osh (Katta)', 2, 'new', 'piyozsiz'], ['Non', 2, 'new', null]]);
    // Takroriy «Keldi» — ikkinchi buyurtma yo'q
    const again = await res.seatReservation(ali, r19.id, seatNow);
    expect(again).toMatchObject({ ok: true, data: { existing: true, orderId: seated.data.orderId } });
    expect(await m.Order.countDocuments({ tableId: t5 })).toBe(1);
    // Yakunlangan bronni tahrirlab/bekor qilib bo'lmaydi
    expect(await res.cancelReservation(kassir, r19.id, '', seatNow)).toMatchObject({ ok: false, code: 'reservationClosed' });

    // 7-stolda ofitsant ochgan buyurtma bor — shu stol broni «Keldi» bo'lmaydi
    const r7 = await res.createReservation(kassir, base({ tableId: t7, time: '18:00', durationMin: 60 }), NOW);
    expect(r7.ok).toBe(true);
    expect((await ops.openOrder(ali, { type: 'dine_in', tableId: t7, guests: 2 })).ok).toBe(true);
    expect(await res.seatReservation(kassir, r7.ok ? r7.data.reservation.id : '', clock('17:55'))).toMatchObject({ ok: false, code: 'tableBusy' });
  });

  it('«Keldi»: stop-listga tushgan oldindan taom tashlab ketiladi, stol baribir ochiladi; faqat bron huquqi bilan ham', async () => {
    const r = await res.createReservation(kassir, base({ tableId: t6, time: '15:00', guests: 2, items: [{ productId: P.somsa, qty: 3 }, { productId: P.non, qty: 1 }] }), NOW);
    expect(r.ok).toBe(true);
    await m.Product.updateOne({ _id: P.somsa }, { $set: { stopListed: true } });
    const onlyRes = ctx(user(new Types.ObjectId().toString(), 'xostes'), ['reservation.manage']);
    const seated = await res.seatReservation(onlyRes, r.ok ? r.data.reservation.id : '', clock('14:40'));
    expect(seated.ok).toBe(true);
    if (!seated.ok) return;
    expect(seated.data.skipped.map((x) => x.name)).toEqual(['Somsa']);
    expect(seated.data.order!.items.map((i) => i.name)).toEqual(['Non']);
    await m.Product.updateOne({ _id: P.somsa }, { $set: { stopListed: false } });
  });

  it('bekor qilish va «Kelmadi»: vaqt kelmaguncha «Kelmadi» yo\'q; bekor qilingan vaqt bo\'shaydi', async () => {
    const r = await res.createReservation(kassir, base({ tableId: t6, time: '20:00', guests: 2 }), NOW);
    const id = r.ok ? r.data.reservation.id : '';
    expect(await res.markNoShow(kassir, id, NOW)).toMatchObject({ ok: false, code: 'reservationNotStarted' });
    expect(await res.markNoShow(kassir, id, clock('20:20'))).toMatchObject({ ok: true, data: { reservation: { status: 'no_show' } } });
    expect(await res.markNoShow(kassir, id, clock('20:20'))).toMatchObject({ ok: false, code: 'reservationClosed' });

    const c = await res.createReservation(kassir, base({ tableId: t6, time: '22:00', guests: 2 }), NOW);
    const cid = c.ok ? c.data.reservation.id : '';
    expect(await res.cancelReservation(kassir, cid, 'Mijoz bekor qildi', NOW)).toMatchObject({ ok: true, data: { reservation: { status: 'cancelled', cancelReason: 'Mijoz bekor qildi', cancelledBy: 'Kassir Malika' } } });
    // Bekor qilingan va «Kelmadi» bronlar stolni band qilmaydi
    expect((await res.createReservation(kassir, base({ tableId: t6, time: '22:00', guests: 2, customerName: 'Yangi', customerPhone: '+998 93 333 33 33' }), NOW)).ok).toBe(true);
  });

  it('tahrirlash: ustma-ust rad, vaqt o\'zgarsa eslatma qayta, filial o\'zgarmaydi', async () => {
    const r = await res.createReservation(kassir, base({ tableId: t7, time: '22:00', durationMin: 60 }), NOW);
    const id = r.ok ? r.data.reservation.id : '';
    await m.Reservation.updateOne({ _id: id }, { $set: { remindedAt: NOW } });
    // 5-stol 21:00–23:00 band
    expect(await res.updateReservation(kassir, id, base({ tableId: t5, time: '22:00', durationMin: 60 }), NOW)).toMatchObject({ ok: false, code: 'reservationOverlap' });
    // Boshqa filial stoli: filial xodimiga — ko'rinmaydi, egasiga — filial o'zgarmaydi
    expect(await res.updateReservation(kassir, id, base({ tableId: tOther, time: '22:00' }), NOW)).toMatchObject({ ok: false, code: 'tableNotFound' });
    expect(await res.updateReservation(admin, id, base({ tableId: tOther, time: '22:00' }), NOW)).toMatchObject({ ok: false, code: 'badBranch' });
    // Faqat izoh o'zgarsa — eslatma saqlanadi
    const same = await res.updateReservation(kassir, id, base({ tableId: t7, time: '22:00', durationMin: 60, note: 'deraza yonida' }), NOW);
    expect(same.ok && same.data.reservation.note).toBe('deraza yonida');
    expect((await m.Reservation.findById(id).lean()).remindedAt).toBeTruthy();
    const moved = await res.updateReservation(kassir, id, base({ tableId: t7, time: '22:30', durationMin: 60, guests: 6 }), NOW);
    expect(moved.ok && moved.data.reservation).toMatchObject({ time: '22:30', endTime: '23:30', guests: 6, note: null, remindedAt: null });
  });

  it('parallel yaratish: bitta stol/vaqtga ikkita so\'rov — bittasi o\'tadi', async () => {
    const day2 = rules.addDays(DAY, 1);
    const one = base({ date: day2, tableId: t6, time: '13:00', guests: 2 });
    const results = await Promise.all([
      res.createReservation(kassir, one, NOW),
      res.createReservation(kassir, { ...one, time: '13:30', customerName: 'Ikkinchi', customerPhone: '+998 94 444 44 44' }, NOW),
      res.createReservation(kassir, { ...one, time: '14:00', customerName: 'Uchinchi', customerPhone: '+998 95 555 55 55' }, NOW),
    ]);
    expect(results.filter((x) => x.ok)).toHaveLength(1);
    expect(results.filter((x) => !x.ok).every((x) => !x.ok && x.code === 'reservationOverlap')).toBe(true);
    const { start, end } = rules.dayRange(day2);
    expect(await m.Reservation.countDocuments({ tableId: t6, startAt: { $gte: start, $lt: end } })).toBe(1);
  });

  it('eslatma: oynadagi (≤ 30 daq qolgan, ≤ 10 daq o\'tgan) eslatilmagan bronlar, bir marta', async () => {
    const day3 = rules.addDays(DAY, 2);
    const now = at('17:00', day3);
    const mk = (time: string, tableId: string, extra: Record<string, unknown> = {}) => m.Reservation.create({
      branchId, tableId, tableNumber: 5, customerName: `M ${time}`, customerPhone: '+998 90 000 00 00', guests: 2,
      startAt: clock(time, day3), durationMin: 30, endAt: new Date(clock(time, day3).getTime() + 30 * 60_000), status: 'booked', createdBy: 'kassir', ...extra,
    });
    await mk('17:20', t5);
    await mk('17:30', t6);
    await mk('17:45', t7); // 45 daqiqa — hali erta
    await mk('16:55', tOther, { branchId: otherBranch }); // 5 daqiqa o'tgan — kechikkan cron uchun
    await mk('16:40', t5); // 20 daqiqa o'tgan — eski
    await mk('17:10', t6, { status: 'cancelled' });
    await mk('17:15', t7, { remindedAt: now });
    const send = vi.fn(async () => {});
    const n = await rem.remindDueReservations({ id: 'org1', dbName: 'test' }, m, now, send);
    expect(n).toBe(3);
    const calls = send.mock.calls.map((c) => (c as unknown as [unknown, { params: { time: string }; kind: string; dedupeKey: string; url: string; audience: unknown }])[1]);
    expect(calls.map((c) => c.params.time).sort()).toEqual(['16:55', '17:20', '17:30']);
    expect(calls[0]).toMatchObject({ kind: 'reservationSoon', url: '/app/restaurant/reservations', audience: { anyPermission: ['reservation.manage', 'order.viewAll'], admins: true } });
    expect(calls.every((c) => c.dedupeKey.startsWith('res:'))).toBe(true);
    // Ikkinchi ishga tushish — takror yo'q
    expect(await rem.remindDueReservations({ id: 'org1', dbName: 'test' }, m, now, send)).toBe(0);
    expect(rules.isDueForReminder({ status: 'booked', startAt: clock('17:20', day3), remindedAt: null }, now)).toBe(true);
  });

  it('upcomingByTable: stol bo\'yicha eng yaqin booked bron (60 daq oyna, 30 daq kechikish); huquq/filial', async () => {
    const day4 = rules.addDays(DAY, 3);
    const now = at('18:00', day4);
    const mk = (time: string, tableId: string, tableNumber: number, extra: Record<string, unknown> = {}) => m.Reservation.create({
      branchId, tableId, tableNumber, customerName: `Mehmon ${time}`, customerPhone: '+998 90 000 00 00', guests: 4,
      startAt: clock(time, day4), durationMin: 30, endAt: new Date(clock(time, day4).getTime() + 30 * 60_000), status: 'booked', createdBy: 'kassir', ...extra,
    });
    await mk('18:40', t5, 5);
    await mk('18:50', t5, 5); // shu stolda keyingisi — eng yaqini birinchi
    await mk('17:40', t6, 6); // 20 daqiqa kechikmoqda
    await mk('19:30', t7, 7); // oynadan tashqari
    await mk('18:10', t7, 7, { status: 'cancelled' });
    const up = await res.upcomingByTable(ali, String(branchId), now);
    expect(Object.keys(up).sort()).toEqual([t5, t6].sort());
    expect(up[t5]).toMatchObject({ time: '18:40', customerName: 'Mehmon 18:40', guests: 4, late: false });
    expect(up[t6]).toMatchObject({ time: '17:40', late: true });
    expect(Object.keys(await res.upcomingByTable(ali, String(branchId), now, 120))).toContain(t7);
    expect(await res.upcomingByTable(boshqa, String(branchId), now)).toEqual({});
    expect(await res.upcomingByTable(ctx(user(ids.ali, 'oshpaz'), ['kitchen.view']), String(branchId), now)).toEqual({});
  });
});

/**
 * Savora — DEMO do'kon (investorga ko'rsatish uchun to'la ma'lumotli).
 * Ishga tushirish (Node >= 20):
 *   node --env-file=.env scripts/seed-demo.mjs
 *
 * Yaratadi: "Savora Demo" do'koni — mahsulotlar, sotuvlar, qarzdorlar,
 * IMEI qora ro'yxat, sharhlar. Har ishga tushirishda demo ma'lumot yangilanadi.
 *
 * Kirish: /t/demo/login  →  admin / demo123
 */
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const URI = process.env.MONGO_URI;
const MASTER = process.env.MASTER_DB_NAME || 'savdopro_master';
if (!URI) { console.error('MONGO_URI yo\'q (.env)'); process.exit(1); }

const ORG = { name: 'Savora Demo', slug: 'demo', dbName: 'biznes_demo' };
const ADMIN = { username: 'admin', password: 'demo123' };
const oid = () => new mongoose.Types.ObjectId();
const daysAgo = (n) => new Date(Date.now() - n * 864e5);
const daysAhead = (n) => new Date(Date.now() + n * 864e5);

async function main() {
  const base = await mongoose.createConnection(URI, { dbName: MASTER }).asPromise();
  console.log('Master DB ulandi:', MASTER);

  // 1) Organization
  const expiresAt = daysAhead(45);
  const orgRes = await base.collection('organizations').findOneAndUpdate(
    { slug: ORG.slug },
    {
      $set: {
        name: ORG.name, slug: ORG.slug, dbName: ORG.dbName, businessType: 'phone_shop',
        ownerName: 'Jasur Rahimov', phone: '+998901234567',
        status: 'active', expiresAt,
        plan: { tier: 'business', maxFilial: 10, maxUsers: 50, monthlyPayment: 499000, isTrial: false },
        features: {
          sales: true, kassa: true, monitoring: true, products: true, users: true,
          export: true, inventory: true, variant: true, creditKassa: true,
          kirimChiqim: true, mediaUpload: true, transferred: true, audit: true,
        },
        adminUsername: ADMIN.username, updatedAt: new Date(),
      },
      $setOnInsert: { createdAt: daysAgo(120) },
    },
    { upsert: true, returnDocument: 'after' }
  );
  const orgId = orgRes._id || (await base.collection('organizations').findOne({ slug: ORG.slug }))._id;
  console.log('Do\'kon:', ORG.name);

  const t = base.useDb(ORG.dbName);

  // Eski demo ma'lumotni tozalash (idempotent)
  for (const c of ['products', 'sales', 'customers', 'branches']) {
    await t.collection(c).deleteMany({});
  }

  // 2) Admin
  const adminHash = await bcrypt.hash(ADMIN.password, 10);
  await t.collection('users').updateOne(
    { username: ADMIN.username },
    { $set: { username: ADMIN.username, password: adminHash, role: 'admin', active: true, fullName: 'Jasur Rahimov', tokenVersion: 0, mustChangePassword: false, updatedAt: new Date() }, $setOnInsert: { createdAt: daysAgo(120) } },
    { upsert: true }
  );

  // 3) Filiallar
  const branchMain = oid(), branchChil = oid();
  await t.collection('branches').insertMany([
    { _id: branchMain, name: 'Markaziy filial', address: 'Amir Temur ko\'chasi 12', active: true, createdAt: daysAgo(120) },
    { _id: branchChil, name: 'Chilonzor filiali', address: 'Bunyodkor 45', active: true, createdAt: daysAgo(60) },
  ]);

  // 4) Mahsulotlar
  const P = (name, brand, model, color, imei, buy, sale, status, branchId) => ({
    _id: oid(), name, brand, deviceModel: model, color, imei,
    purchasePrice: buy, salePrice: sale, trackQuantity: false, quantity: 1, soldQuantity: status === 'sold' ? 1 : 0,
    status, branchId, createdBy: 'admin', createdAt: daysAgo(40),
    ...(status === 'sold' ? { soldAt: daysAgo(5) } : {}), history: [],
  });
  const products = [
    P('iPhone 15 Pro 256GB', 'Apple', 'iPhone 15 Pro', 'Titanium', '353914100088210', 12800000, 14200000, 'in_stock', branchMain),
    P('iPhone 15 128GB', 'Apple', 'iPhone 15', 'Black', '353914100088211', 9800000, 11200000, 'in_stock', branchMain),
    P('iPhone 14 128GB', 'Apple', 'iPhone 14', 'Blue', '353914100088212', 8200000, 9900000, 'sold', branchMain),
    P('Samsung S24 Ultra 512GB', 'Samsung', 'Galaxy S24 Ultra', 'Gray', '356712400044901', 12200000, 13850000, 'in_stock', branchMain),
    P('Samsung S24 256GB', 'Samsung', 'Galaxy S24', 'Violet', '356712400044902', 8500000, 9700000, 'sold', branchChil),
    P('Samsung A55 128GB', 'Samsung', 'Galaxy A55', 'Navy', '356712400044903', 4200000, 4950000, 'in_stock', branchChil),
    P('Xiaomi 14 256GB', 'Xiaomi', 'Xiaomi 14', 'Green', '861234500077320', 6400000, 7400000, 'sold', branchMain),
    P('Redmi Note 13 Pro', 'Xiaomi', 'Redmi Note 13 Pro', 'Black', '861234500077321', 2700000, 3250000, 'in_stock', branchMain),
    P('Redmi 13C 128GB', 'Xiaomi', 'Redmi 13C', 'Blue', '861234500077322', 1500000, 1850000, 'sold', branchChil),
    P('iPhone 13 128GB', 'Apple', 'iPhone 13', 'Pink', '353914100088213', 6800000, 8100000, 'in_stock', branchMain),
    P('AirPods Pro 2', 'Apple', 'AirPods Pro', 'White', '353914100088214', 1700000, 2100000, 'sold', branchMain),
    P('Samsung A35 128GB', 'Samsung', 'Galaxy A35', 'Lime', '356712400044904', 3400000, 4100000, 'in_stock', branchChil),
  ];
  await t.collection('products').insertMany(products);
  console.log('Mahsulotlar:', products.length);

  // 5) Mijozlar
  const customers = [
    { _id: oid(), fullName: 'Akmal Yusupov', phone: '+998901112233', createdAt: daysAgo(30) },
    { _id: oid(), fullName: 'Dilnoza Karimova', phone: '+998902223344', createdAt: daysAgo(25) },
    { _id: oid(), fullName: 'Sardor Aliyev', phone: '+998903334455', createdAt: daysAgo(20) },
    { _id: oid(), fullName: 'Nigora Tosheva', phone: '+998904445566', createdAt: daysAgo(15) },
    { _id: oid(), fullName: 'Bobur Rasulov', phone: '+998905556677', createdAt: daysAgo(10) },
  ];
  await t.collection('customers').insertMany(customers);

  // 6) Sotuvlar (naqd, qarz, nasiya) — ba'zilari qarzdor, ba'zilari muddati o'tgan
  let n = 0;
  const saleNo = () => `SAV-${String(++n).padStart(4, '0')}`;
  const sold = products.filter((p) => p.status === 'sold');
  const mkSale = (prod, cust, ptype, total, paid, dueDate, when) => {
    const remaining = Math.max(0, total - paid);
    return {
      _id: oid(), saleNo: saleNo(), productId: prod._id,
      productSnapshot: { name: prod.name, imei: prod.imei, brand: prod.brand, deviceModel: prod.deviceModel, purchasePrice: prod.purchasePrice, saleQuantity: 1 },
      ...(cust ? { customerId: cust._id, customerSnapshot: { fullName: cust.fullName, phone: cust.phone } } : {}),
      branchId: prod.branchId, paymentType: ptype, totalAmount: total, paidAmount: paid, remainingAmount: remaining,
      ...(dueDate ? { dueDate } : {}), status: remaining > 0 ? 'partial' : 'paid',
      payments: paid > 0 ? [{ amount: paid, paidAt: when, note: ptype === 'cash' ? 'Naqd' : 'Boshlang\'ich', recordedBy: 'admin' }] : [],
      soldBy: 'admin', createdAt: when,
    };
  };
  const sales = [
    mkSale(sold[0], customers[0], 'cash', 9900000, 9900000, null, daysAgo(5)),
    mkSale(sold[1], customers[1], 'installment', 9700000, 3000000, daysAhead(20), daysAgo(12)),
    mkSale(sold[2], customers[2], 'debt', 7400000, 4000000, daysAgo(8), daysAgo(40)),   // muddati o'tgan
    mkSale(sold[3], customers[3], 'installment', 1850000, 600000, daysAhead(3), daysAgo(18)), // yaqin
    mkSale(sold[4], customers[4], 'cash', 2100000, 2100000, null, daysAgo(2)),
  ];
  await t.collection('sales').insertMany(sales);
  console.log('Sotuvlar:', sales.length, '(qarzdorlar:', sales.filter(s => s.remainingAmount > 0).length, ')');

  // 7) IMEI qora ro'yxat (master)
  await base.collection('imei_blacklist').deleteMany({ organizationId: orgId });
  await base.collection('imei_blacklist').insertMany([
    { imei: '356712400044999', reason: 'debt', organizationId: orgId, orgName: ORG.name, orgSlug: ORG.slug, customerName: 'Aziz Komilov', customerPhone: '+998906667788', note: '3 oydan beri to\'lamayapti', resolved: false, createdBy: 'admin', createdAt: daysAgo(10) },
    { imei: '861234500077999', reason: 'fraud', organizationId: orgId, orgName: ORG.name, orgSlug: ORG.slug, customerName: 'Noma\'lum', note: 'Soxta hujjat bilan nasiya olmoqchi bo\'ldi', resolved: false, createdBy: 'admin', createdAt: daysAgo(4) },
  ]);

  // 8) Sharhlar (master — landing'da ko'rinadi)
  await base.collection('reviews').deleteMany({ organizationId: orgId });
  await base.collection('reviews').insertMany([
    { organizationId: orgId, shopName: ORG.name, shopSlug: ORG.slug, rating: 5, comment: 'Ombor va nasiya bir joyda — vaqtimni 2 barobar tejadim.', authorName: 'Jasur', approved: true, createdAt: daysAgo(7) },
    { organizationId: orgId, shopName: ORG.name, shopSlug: ORG.slug, rating: 5, comment: 'Qarzdorlarni kuzatish juda qulay. IMEI qora ro\'yxat zo\'r.', authorName: 'Dilnoza', approved: true, createdAt: daysAgo(3) },
  ]);

  await base.close();
  console.log('\n✅ Demo tayyor!  Kirish: /t/demo/login  →  admin / demo123');
  process.exit(0);
}

main().catch((e) => { console.error('❌ Demo seed xatosi:', e); process.exit(1); });

/**
 * Savora — DEMO seed (boy ma'lumot bilan).
 *   node --env-file=.env scripts/seed.mjs
 *
 * Yaratadi:
 *   1) Super admin (master)                → admin / SEED_ADMIN_PASSWORD (yo'q bo'lsa tasodifiy, bir marta chop etiladi)
 *   2) Demo do'kon "Dokon 1" (barcha modullar yoqilgan)
 *   3) Do'kon admini                        → admin / admin123
 *   4) Filial-login (Chilonzor filiali)     → chilonzor / demo123
 *   5) user_directory (slug'siz login uchun global registr)
 *   6) Demo mahsulotlar, mijozlar va sotuvlar (naqd, qarz, nasiya)
 *
 * DIQQAT: "biznes_dokon1" demo bazasi HAR ISHGA TUSHIRISHDA tozalanadi (idempotent demo).
 */
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

// Production bazasiga demo ma'lumot (va ma'lum parollar) tushib qolmasin
if (process.env.NODE_ENV === 'production' && process.env.SEED_ALLOW !== '1') {
  console.error('Seed production\'da bloklangan. Ataylab kerak bo\'lsa: SEED_ALLOW=1');
  process.exit(1);
}

const { Types } = mongoose;
const URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
// lib/db.ts bilan bir xil default — aks holda seed boshqa bazaga yozib, login ishlamaydi
const MASTER = process.env.MASTER_DB_NAME || 'savdopro_master';

// Super admin paroli: SEED_ADMIN_PASSWORD yoki tasodifiy (bir marta chop etiladi)
const SUPER = { username: 'admin', password: process.env.SEED_ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url') };
const ORG = { name: 'Dokon 1', slug: 'dokon1', dbName: 'biznes_dokon1' };
const ADMIN = { username: 'admin', password: 'admin123' };
const BRANCH_LOGIN = { username: 'chilonzor', password: 'demo123' };

// Barcha modullar yoqilgan
const ALL_FEATURES = {
  sales: true, kassa: true, variant: true, creditKassa: true, kirimChiqim: true,
  monitoring: true, products: true, inventory: true, users: true, export: true,
  mediaUpload: true, transferred: true, audit: true, daftar: true, nasiya: true,
};

const days = (n) => new Date(Date.now() + n * 864e5);
const ago = (n) => new Date(Date.now() - n * 864e5);

async function main() {
  const base = await mongoose.createConnection(URI, { dbName: MASTER }).asPromise();
  console.log('OK — Master DB:', MASTER);

  // ── 1) Super admin ──────────────────────────────────────────────
  const superHash = await bcrypt.hash(SUPER.password, 10);
  await base.collection('superadmins').updateOne(
    { username: SUPER.username },
    { $set: { username: SUPER.username, password: superHash, tokenVersion: 0, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
    { upsert: true }
  );
  // Parol faqat shu yerda, bir marta chop etiladi (tasodifiy bo'lsa — saqlab qo'ying)
  console.log(`OK — Super admin: ${SUPER.username} / ${SUPER.password}${process.env.SEED_ADMIN_PASSWORD ? '' : '   (tasodifiy — saqlab qo\'ying)'}`);

  // ── 2) Organization (barcha modullar yoqilgan) ──────────────────
  await base.collection('organizations').updateOne(
    { slug: ORG.slug },
    {
      $set: {
        name: ORG.name, slug: ORG.slug, dbName: ORG.dbName,
        businessType: 'phone_shop', status: 'active', expiresAt: days(30),
        plan: { tier: 'pro', maxFilial: 5, maxUsers: 15, monthlyPayment: 250000, isTrial: false },
        features: ALL_FEATURES,
        adminUsername: ADMIN.username, updatedAt: new Date(),
        onboarding: { branchCreated: true, productAdded: true, saleMade: true, profileCompleted: true },
      },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true }
  );
  const org = await base.collection('organizations').findOne({ slug: ORG.slug });
  console.log(`OK — Do'kon: ${ORG.name} (barcha modullar yoqilgan), muddat: ${days(30).toISOString().slice(0, 10)}`);

  // ── Tenant demo bazasini tozalab, qaytadan quramiz ──────────────
  const t = base.useDb(ORG.dbName);
  for (const c of ['users', 'branches', 'products', 'customers', 'sales']) {
    await t.collection(c).deleteMany({});
  }

  // ── 3) Filiallar ────────────────────────────────────────────────
  const mainBranch = { _id: new Types.ObjectId(), name: 'Asosiy filial', address: 'Toshkent, Yunusobod', active: true, isMain: true, createdAt: new Date(), updatedAt: new Date() };
  const chBranch = { _id: new Types.ObjectId(), name: 'Chilonzor filiali', address: 'Toshkent, Chilonzor', active: true, isMain: false, createdAt: new Date(), updatedAt: new Date() };
  await t.collection('branches').insertMany([mainBranch, chBranch]);
  console.log('OK — 2 filial: Asosiy, Chilonzor');

  // ── 4) Do'kon admini + filial-login ─────────────────────────────
  const adminHash = await bcrypt.hash(ADMIN.password, 10);
  const branchHash = await bcrypt.hash(BRANCH_LOGIN.password, 10);
  await t.collection('users').insertMany([
    { username: ADMIN.username, password: adminHash, role: 'admin', fullName: 'Do\'kon egasi', active: true, mustChangePassword: false, tokenVersion: 0, createdAt: new Date(), updatedAt: new Date() },
    { username: BRANCH_LOGIN.username, password: branchHash, role: 'user', fullName: 'Chilonzor filiali', branchId: chBranch._id, active: true, mustChangePassword: false, tokenVersion: 0, createdAt: new Date(), updatedAt: new Date() },
  ]);
  console.log(`OK — Admin: ${ADMIN.username} / ${ADMIN.password} · Filial: ${BRANCH_LOGIN.username} / ${BRANCH_LOGIN.password}`);

  // ── 5) user_directory (slug'siz global login) ───────────────────
  const dir = base.collection('user_directory');
  await dir.createIndex({ username: 1 }, { unique: true });
  await dir.deleteMany({ organizationId: org._id });
  await dir.insertMany([
    { username: ADMIN.username, organizationId: org._id, dbName: ORG.dbName, role: 'admin', createdAt: new Date(), updatedAt: new Date() },
    { username: BRANCH_LOGIN.username, organizationId: org._id, dbName: ORG.dbName, role: 'user', branchId: String(chBranch._id), createdAt: new Date(), updatedAt: new Date() },
  ]);
  console.log('OK — user_directory to\'ldirildi (slug\'siz login ishlaydi)');

  // ── 6) Mahsulotlar ──────────────────────────────────────────────
  const P = (over) => ({ _id: new Types.ObjectId(), branchId: mainBranch._id, status: 'in_stock', trackQuantity: false, quantity: 1, soldQuantity: 0, createdBy: 'admin', createdAt: ago(20), updatedAt: new Date(), history: [], ...over });
  const products = [
    P({ name: 'iPhone 13 128GB', brand: 'Apple', deviceModel: 'iPhone 13', color: 'Midnight', imei: '350000000000001', purchasePrice: 8_500_000, salePrice: 9_800_000 }),
    P({ name: 'iPhone 14 Pro 256GB', brand: 'Apple', deviceModel: 'iPhone 14 Pro', color: 'Deep Purple', imei: '350000000000002', purchasePrice: 12_000_000, salePrice: 14_200_000 }),
    P({ name: 'Samsung Galaxy S23', brand: 'Samsung', deviceModel: 'Galaxy S23', color: 'Green', imei: '350000000000003', purchasePrice: 9_000_000, salePrice: 10_500_000 }),
    P({ name: 'Xiaomi Redmi Note 12', brand: 'Xiaomi', deviceModel: 'Redmi Note 12', color: 'Blue', imei: '350000000000004', purchasePrice: 2_200_000, salePrice: 2_900_000 }),
    P({ name: 'iPhone 15 Pro Max 256GB', brand: 'Apple', deviceModel: 'iPhone 15 Pro Max', color: 'Titanium', imei: '350000000000005', purchasePrice: 15_000_000, salePrice: 17_500_000 }),
    P({ name: 'Samsung Galaxy A54', brand: 'Samsung', deviceModel: 'Galaxy A54', color: 'White', imei: '350000000000006', purchasePrice: 3_800_000, salePrice: 4_600_000 }),
    P({ name: 'AirPods Pro 2', brand: 'Apple', deviceModel: 'AirPods Pro', imei: 'AIRPODS-PRO-2-001', purchasePrice: 1_800_000, salePrice: 2_400_000, trackQuantity: true, quantity: 20, soldQuantity: 3 }),
  ];
  await t.collection('products').insertMany(products);
  console.log(`OK — ${products.length} mahsulot`);

  // ── 7) Mijozlar ─────────────────────────────────────────────────
  const cust = (fullName, phone) => ({ _id: new Types.ObjectId(), fullName, phone, createdAt: ago(15), updatedAt: new Date() });
  const customers = [
    cust('Akmal Karimov', '+998901234567'),
    cust('Dilnoza Yusupova', '+998907654321'),
    cust('Sardor Aliyev', '+998935551122'),
    cust('Nodira Rashidova', '+998977778899'),
  ];
  await t.collection('customers').insertMany(customers);
  console.log(`OK — ${customers.length} mijoz`);

  // ── 8) Sotuvlar (naqd, qarz, nasiya) ────────────────────────────
  const snap = (p) => ({ name: p.name, imei: p.imei, brand: p.brand, deviceModel: p.deviceModel, purchasePrice: p.purchasePrice, saleQuantity: 1 });
  const cSnap = (c) => ({ fullName: c.fullName, phone: c.phone });
  let n = 0;
  const saleNo = () => `S-${String(++n).padStart(4, '0')}`;
  const markSold = (p, type) => { p.status = 'sold'; p.soldAt = new Date(); p.soldPaymentType = type === 'cash' ? 'cash' : 'credit'; };

  const sales = [];

  // A) Naqd — to'liq to'langan
  markSold(products[0], 'cash');
  sales.push({ _id: new Types.ObjectId(), saleNo: saleNo(), productId: products[0]._id, productSnapshot: snap(products[0]),
    customerId: customers[0]._id, customerSnapshot: cSnap(customers[0]), branchId: mainBranch._id,
    paymentType: 'cash', totalAmount: 9_800_000, paidAmount: 9_800_000, remainingAmount: 0, status: 'paid',
    payments: [{ amount: 9_800_000, paidAt: ago(5), note: 'Naqd to\'lov', recordedBy: 'admin' }], soldBy: 'admin', createdAt: ago(5), updatedAt: new Date() });

  // B) Naqd — Xiaomi
  markSold(products[3], 'cash');
  sales.push({ _id: new Types.ObjectId(), saleNo: saleNo(), productId: products[3]._id, productSnapshot: snap(products[3]),
    customerId: customers[0]._id, customerSnapshot: cSnap(customers[0]), branchId: mainBranch._id,
    paymentType: 'cash', totalAmount: 2_900_000, paidAmount: 2_900_000, remainingAmount: 0, status: 'paid',
    payments: [{ amount: 2_900_000, paidAt: ago(3), note: 'Naqd to\'lov', recordedBy: 'admin' }], soldBy: 'admin', createdAt: ago(3), updatedAt: new Date() });

  // C) Qarz — qisman to'langan (Qarzdorlik ro'yxatida)
  markSold(products[2], 'credit');
  sales.push({ _id: new Types.ObjectId(), saleNo: saleNo(), productId: products[2]._id, productSnapshot: snap(products[2]),
    customerId: customers[1]._id, customerSnapshot: cSnap(customers[1]), branchId: mainBranch._id,
    paymentType: 'debt', totalAmount: 10_500_000, paidAmount: 4_000_000, remainingAmount: 6_500_000, status: 'partial', dueDate: days(20),
    payments: [{ amount: 4_000_000, paidAt: ago(4), note: 'Boshlang\'ich to\'lov', recordedBy: 'admin' }], soldBy: 'admin', createdAt: ago(4), updatedAt: new Date() });

  // D) Nasiya — yangi (boshlang'ich 0, 6 oy) — installment jadvali screenshot kabi
  markSold(products[4], 'credit');
  sales.push({ _id: new Types.ObjectId(), saleNo: saleNo(), productId: products[4]._id, productSnapshot: snap(products[4]),
    customerId: customers[2]._id, customerSnapshot: cSnap(customers[2]), branchId: mainBranch._id,
    paymentType: 'installment', totalAmount: 17_500_000, paidAmount: 0, remainingAmount: 17_500_000, status: 'partial',
    installmentMonths: 6, dueDate: days(180), notes: 'Nasiya — 6 oyga', payments: [], soldBy: 'admin', createdAt: ago(2), updatedAt: new Date() });

  // E) Nasiya — qisman (boshlang'ich 4.2M + 2 oy to'langan, 5 oy)
  markSold(products[1], 'credit');
  sales.push({ _id: new Types.ObjectId(), saleNo: saleNo(), productId: products[1]._id, productSnapshot: snap(products[1]),
    customerId: customers[3]._id, customerSnapshot: cSnap(customers[3]), branchId: mainBranch._id,
    paymentType: 'installment', totalAmount: 14_200_000, paidAmount: 8_200_000, remainingAmount: 6_000_000, status: 'partial',
    installmentMonths: 5, dueDate: days(90), notes: 'Nasiya — 5 oyga',
    payments: [
      { amount: 4_200_000, paidAt: ago(60), note: 'Boshlang\'ich to\'lov', recordedBy: 'admin' },
      { amount: 2_000_000, paidAt: ago(30), note: '2-oy to\'lovi', recordedBy: 'admin' },
      { amount: 2_000_000, paidAt: ago(1), note: '3-oy to\'lovi', recordedBy: 'admin' },
    ], soldBy: 'admin', createdAt: ago(60), updatedAt: new Date() });

  await t.collection('sales').insertMany(sales);
  // Sotilgan mahsulotlarning statusini yozamiz
  for (const p of products) {
    await t.collection('products').updateOne({ _id: p._id }, { $set: { status: p.status, soldAt: p.soldAt, soldPaymentType: p.soldPaymentType } });
  }
  console.log(`OK — ${sales.length} sotuv (2 naqd, 1 qarz, 2 nasiya)`);

  await base.close();
  console.log('\n✅ DEMO SEED TUGADI\n');
  console.log('Kirish (http://localhost:3000/login) — endi slug shart emas, faqat login+parol:');
  console.log('   Super admin:   admin / <yuqorida chop etilgan parol>   (http://localhost:3000/super/login)');
  console.log('   Do\'kon egasi:  admin / admin123');
  console.log('   Filial-login:  chilonzor / demo123');
  process.exit(0);
}

main().catch((e) => { console.error('Seed xatosi:', e); process.exit(1); });

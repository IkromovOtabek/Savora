/**
 * SavdoPro — boshlang'ich seed.
 * Ishga tushirish (Node >= 20):
 *   node --env-file=.env scripts/seed.mjs
 *
 * Yaratadi:
 *   1) Super admin (master DB)         → admin / admin123
 *   2) Test do'kon "dokon1" (master)   → muddat +30 kun, active
 *   3) Do'kon admini (tenant_dokon1)   → admin / admin123
 *
 * Sinash:
 *   Super:  http://admin.lvh.me:3000/login   (admin / admin123)
 *   Do'kon: http://dokon1.lvh.me:3000/login  (admin / admin123)
 */
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
const MASTER = process.env.MASTER_DB_NAME || 'savdopro_master';

const SUPER = { username: 'admin', password: 'admin123' };
const ORG = { name: 'Dokon 1', slug: 'dokon1', dbName: 'biznes_dokon1' };
const ORG_ADMIN = { username: 'admin', password: 'admin123' };

async function main() {
  const base = await mongoose.createConnection(URI, { dbName: MASTER }).asPromise();
  console.log('OK — Master DB ulandi:', MASTER);

  // 1) Super admin
  const SuperAdmin = base.collection('superadmins');
  const superHash = await bcrypt.hash(SUPER.password, 10);
  await SuperAdmin.updateOne(
    { username: SUPER.username },
    { $set: { username: SUPER.username, password: superHash, tokenVersion: 0, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
    { upsert: true }
  );
  console.log(`OK — Super admin: ${SUPER.username} / ${SUPER.password}`);

  // 2) Organization
  const Organizations = base.collection('organizations');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await Organizations.updateOne(
    { slug: ORG.slug },
    {
      $set: {
        name: ORG.name, slug: ORG.slug, dbName: ORG.dbName,
        businessType: 'phone_shop',
        status: 'active', expiresAt,
        plan: { tier: 'pro', maxFilial: 5, maxUsers: 15 },
        features: {
          sales: true, kassa: true, monitoring: true, products: true,
          users: true, export: true,
        },
        adminUsername: ORG_ADMIN.username,
        updatedAt: new Date(),
      },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true }
  );
  console.log(`OK — Do'kon: ${ORG.name} (slug: ${ORG.slug}, db: ${ORG.dbName}), muddat: ${expiresAt.toISOString().slice(0,10)}`);

  // 3) Tenant admin (do'kon egasi)
  const tenant = base.useDb(ORG.dbName);
  const Users = tenant.collection('users');
  const adminHash = await bcrypt.hash(ORG_ADMIN.password, 10);
  await Users.updateOne(
    { username: ORG_ADMIN.username },
    { $set: { username: ORG_ADMIN.username, password: adminHash, role: 'admin', active: true, tokenVersion: 0, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
    { upsert: true }
  );
  console.log(`OK — Do'kon admini: ${ORG_ADMIN.username} / ${ORG_ADMIN.password}`);

  // 4) Asosiy filial
  const Branches = tenant.collection('branches');
  await Branches.updateOne(
    { name: 'Asosiy filial' },
    { $set: { name: 'Asosiy filial', active: true, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
    { upsert: true }
  );
  console.log('OK — Asosiy filial yaratildi');

  await base.close();
  console.log('\nSeed tugadi. Sinash (localhost:3000):');
  console.log('   Super:  http://localhost:3000/super/login   (admin / admin123)');
  console.log('   Do\'kon: http://localhost:3000/t/dokon1/login  (admin / admin123)');
  process.exit(0);
}

main().catch((e) => { console.error('❌ Seed xatosi:', e); process.exit(1); });

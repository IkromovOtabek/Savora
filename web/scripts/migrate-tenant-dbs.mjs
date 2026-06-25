/**
 * Eski tenant_* DB nomlarini biznes_* ga yangilaydi va collectionlarni tayyorlaydi.
 * node --env-file=.env scripts/migrate-tenant-dbs.mjs
 */
import mongoose from 'mongoose';

const URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
const MASTER = process.env.MASTER_DB_NAME || 'savdopro_master';
const COLLECTIONS = ['users', 'branches', 'products', 'customers', 'sales'];

async function copyDb(client, from, to) {
  if (from === to) return;
  const src = client.db(from);
  const dst = client.db(to);
  for (const col of COLLECTIONS) {
    const docs = await src.collection(col).find().toArray();
    if (docs.length === 0) continue;
    await dst.collection(col).deleteMany({});
    await dst.collection(col).insertMany(docs);
    console.log(`  OK — ${from}.${col} -> ${to}.${col} (${docs.length} ta)`);
  }
}

async function ensureCollections(db) {
  const existing = await db.listCollections().toArray();
  const names = new Set(existing.map((c) => c.name));
  for (const col of COLLECTIONS) {
    if (!names.has(col)) {
      await db.createCollection(col);
      console.log(`  OK — ${db.databaseName}.${col} yaratildi`);
    }
  }
}

async function main() {
  const conn = await mongoose.createConnection(URI, { dbName: MASTER }).asPromise();
  const client = conn.getClient();
  const orgs = await conn.collection('organizations').find().toArray();

  console.log(`OK — ${orgs.length} ta biznes topildi\n`);

  for (const org of orgs) {
    const slug = org.slug;
    const newDb = `biznes_${slug}`;
    const oldDb = org.dbName;

    console.log(`> ${org.name} (${slug})`);

    if (oldDb.startsWith('tenant_') && oldDb !== newDb) {
      await copyDb(client, oldDb, newDb);
      await conn.collection('organizations').updateOne(
        { _id: org._id },
        { $set: { dbName: newDb, updatedAt: new Date() } },
      );
      console.log(`  OK — dbName: ${oldDb} -> ${newDb}`);
    } else if (oldDb !== newDb) {
      await conn.collection('organizations').updateOne(
        { _id: org._id },
        { $set: { dbName: newDb, updatedAt: new Date() } },
      );
      console.log(`  OK — dbName yangilandi: ${newDb}`);
    }

    await ensureCollections(client.db(newDb));
    console.log('');
  }

  await conn.close();
  console.log('Migratsiya tugadi.');
  console.log('\nMongoDB struktura:');
  console.log(`  ${MASTER}/organizations  — barcha bizneslar`);
  console.log(`  ${MASTER}/superadmins    — super admin`);
  console.log('  biznes_<slug>/users, branches, products, customers, sales — har biznes alohida');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });

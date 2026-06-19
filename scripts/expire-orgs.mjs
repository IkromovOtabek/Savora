/**
 * Muddat tugagan do'konlarni expired qiladi.
 * node --env-file=.env scripts/expire-orgs.mjs
 */
import mongoose from 'mongoose';

const URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
const MASTER = process.env.MASTER_DB_NAME || 'savdopro_master';

async function main() {
  const conn = await mongoose.createConnection(URI, { dbName: MASTER }).asPromise();
  const now = new Date();
  const r = await conn.collection('organizations').updateMany(
    { status: 'active', expiresAt: { $lt: now } },
    { $set: { status: 'expired', updatedAt: now } },
  );
  console.log(`OK — ${r.modifiedCount} ta do'kon expired qilindi`);
  await conn.close();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });

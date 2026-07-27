/**
 * Global login registrini (user_directory) mavjud do'konlardagi loginlardan quradi.
 * Slug'siz "login + parol" kirish shu registrga tayanadi.
 *
 *   node --env-file=.env scripts/build-user-directory.mjs
 *
 * Butun platforma bo'yicha TAKROR username'lar (2+ do'konda bir xil login) global
 * yagona bo'la olmaydi — skript ularni ogohlantirib, faqat birinchisini yozadi.
 * Takrorlarni do'kon egalari qayta nomlashi kerak.
 */
import mongoose from 'mongoose';

const URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
const MASTER = process.env.MASTER_DB_NAME || 'savdopro_master';

async function main() {
  const conn = await mongoose.createConnection(URI, { dbName: MASTER }).asPromise();
  const client = conn.getClient();
  const dir = conn.collection('user_directory');

  // Unique indeks — global yagonalik kafolati
  await dir.createIndex({ username: 1 }, { unique: true });
  await dir.createIndex({ organizationId: 1 });

  const orgs = await conn.collection('organizations').find().toArray();
  console.log(`OK — ${orgs.length} ta do'kon topildi\n`);

  const seen = new Map(); // username -> do'kon nomi (birinchi egasi)
  const dups = [];
  let inserted = 0;

  for (const org of orgs) {
    let users = [];
    try {
      users = await client.db(org.dbName).collection('users').find().toArray();
    } catch {
      console.log(`  ⚠️  ${org.name}: ${org.dbName} bazasini o'qib bo'lmadi — o'tkazib yuborildi`);
      continue;
    }
    for (const u of users) {
      const username = String(u.username || '').trim().toLowerCase();
      if (!username) continue;
      if (seen.has(username)) {
        dups.push({ username, first: seen.get(username), second: org.name });
        continue;
      }
      seen.set(username, org.name);
      await dir.updateOne(
        { username },
        {
          $set: {
            username,
            organizationId: org._id,
            dbName: org.dbName,
            role: u.role === 'admin' ? 'admin' : 'user',
            branchId: u.branchId ? String(u.branchId) : undefined,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true }
      );
      inserted++;
    }
  }

  console.log(`\nOK — ${inserted} ta login registrga yozildi`);

  if (dups.length) {
    console.log(`\n⚠️  ${dups.length} ta TAKROR username (global yagona bo'lishi shart — qayta nomlang):`);
    for (const d of dups) {
      console.log(`  - "${d.username}": ${d.first} (yozildi) / ${d.second} (o'tkazib yuborildi)`);
    }
    console.log('\n  Takror loginli do\'kon egalari yangi login tanlashi kerak, aks holda ular');
    console.log('  slug\'siz kira olmaydi (faqat bittasi ishlaydi).');
  } else {
    console.log('\nTakror username topilmadi — hammasi global yagona. ✅');
  }

  await conn.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('Xatolik:', err);
  process.exit(1);
});

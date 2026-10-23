/**
 * Umumiy shtrix-kod lug'atini (barcode_catalog) mavjud do'konlardagi mahsulotlardan to'ldiradi.
 * Keyin yangi mahsulotlar saqlanganda lug'at o'zi yangilanadi (lib/barcodeLookup.ts → rememberBarcodeNames).
 *
 *   node --env-file=.env scripts/build-barcode-catalog.mjs
 *
 * Qayta ishga tushirish xavfsiz: har do'kon har kod uchun bitta yozuv (upsert).
 * Faqat do'konlararo kodlar (GTIN nazorat raqami to'g'ri, ichki 2xx/02x/04x emas) va nom yoziladi.
 * Demo do'kon (slug "demo") o'tkazib yuboriladi.
 */
import mongoose from 'mongoose';

const URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
const MASTER = process.env.MASTER_DB_NAME || 'savdopro_master';

// lib/barcodeLookup.ts → hasValidGtinCheckDigit / isSharedBarcode bilan bir xil
function hasValidGtinCheckDigit(code) {
  if (!/^(\d{8}|\d{12,14})$/.test(code)) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop();
  const sum = digits.reverse().reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}
function isSharedBarcode(code) {
  if (!hasValidGtinCheckDigit(code)) return false;
  if (code.length === 13) return !/^(2|02|04)/.test(code);
  if (code.length === 12) return !/^[24]/.test(code);
  if (code.length === 8) return !/^[02]/.test(code);
  return true;
}

async function main() {
  const conn = await mongoose.createConnection(URI, { dbName: MASTER }).asPromise();
  const client = conn.getClient();
  const catalog = conn.collection('barcode_catalog');
  await catalog.createIndex({ code: 1, organizationId: 1 }, { unique: true });
  await catalog.createIndex({ code: 1, updatedAt: -1 });

  const orgs = await conn.collection('organizations').find({ slug: { $ne: 'demo' } }).toArray();
  console.log(`OK — ${orgs.length} ta do'kon topildi\n`);

  let total = 0;
  for (const org of orgs) {
    let products = [];
    try {
      products = await client.db(org.dbName).collection('products')
        .find({ barcode: { $exists: true, $nin: [null, ''] }, deletedAt: null }, { projection: { barcode: 1, name: 1, updatedAt: 1 } })
        .sort({ updatedAt: 1 })
        .toArray();
    } catch {
      console.log(`  ⚠️  ${org.name}: ${org.dbName} bazasini o'qib bo'lmadi — o'tkazib yuborildi`);
      continue;
    }
    // Bir do'konda bir kod bir necha marta bo'lsa — eng so'nggi tahrirlangan nom
    const byCode = new Map();
    for (const p of products) {
      const code = String(p.barcode).replace(/\s/g, '');
      const name = String(p.name || '').replace(/\s+/g, ' ').trim().slice(0, 120);
      if (name.length >= 2 && isSharedBarcode(code)) byCode.set(code, name);
    }
    if (!byCode.size) continue;
    const now = new Date();
    await catalog.bulkWrite([...byCode].map(([code, name]) => ({
      updateOne: {
        filter: { code, organizationId: org._id },
        update: {
          $set: { name, nameKey: name.toLowerCase(), updatedAt: now },
          $setOnInsert: { createdAt: now },
        },
        upsert: true,
      },
    })), { ordered: false });
    console.log(`  ${org.name}: ${byCode.size} ta kod`);
    total += byCode.size;
  }

  console.log(`\nOK — lug'atga ${total} ta yozuv (do'kon × kod) yozildi`);
  await conn.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('Xatolik:', err);
  process.exit(1);
});

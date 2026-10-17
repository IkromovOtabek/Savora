/**
 * Savora — super admin yaratish yoki parolini tiklash (production uchun xavfsiz).
 *   npm run super-admin                       → admin / tasodifiy parol (bir marta chop etiladi)
 *   SUPER_ADMIN_PASSWORD=... npm run super-admin
 *   npm run super-admin -- boshqa_login       → login nomini o'zgartirish
 *
 * Faqat master bazadagi `superadmins` ga yozadi — demo do'kon yoki boshqa ma'lumot yaratmaydi.
 * Parol tiklanganda tokenVersion oshadi: eski super-admin sessiyalari yopiladi.
 */
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const URI = process.env.MONGO_URI;
// lib/db.ts bilan bir xil default
const MASTER = process.env.MASTER_DB_NAME || 'savdopro_master';
const username = (process.argv[2] || 'admin').trim().toLowerCase();
const password = process.env.SUPER_ADMIN_PASSWORD || crypto.randomBytes(12).toString('base64url');

if (!URI) {
  console.error('MONGO_URI o\'rnatilmagan — .env ni tekshiring (node --env-file=.env bilan ishga tushiring).');
  process.exit(1);
}
if (password.length < 8) {
  console.error('SUPER_ADMIN_PASSWORD kamida 8 ta belgi bo\'lsin.');
  process.exit(1);
}

const base = await mongoose.createConnection(URI, { dbName: MASTER }).asPromise();
const hash = await bcrypt.hash(password, 10);
const res = await base.collection('superadmins').updateOne(
  { username },
  {
    $set: { username, password: hash, updatedAt: new Date() },
    $inc: { tokenVersion: 1 },
    $setOnInsert: { createdAt: new Date() },
  },
  { upsert: true },
);
console.log(`OK — Master DB: ${MASTER}`);
console.log(`OK — Super admin ${res.upsertedCount ? 'yaratildi' : 'paroli yangilandi'}: ${username} / ${password}`);
if (!process.env.SUPER_ADMIN_PASSWORD) console.log('   (tasodifiy parol — hozir saqlab qo\'ying, qayta ko\'rsatilmaydi)');
console.log('Kirish: /super/login');
await base.close();

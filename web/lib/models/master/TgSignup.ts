import { Schema } from 'mongoose';

/**
 * Telegram orqali ro'yxatdan o'tish so'rovi (mobil ilova, lib/tgSignup.ts):
 *  1. Ilova `nonce` oladi va `t.me/<bot>?start=su_<nonce>` ni ochadi (status: pending).
 *  2. Bot /start su_<nonce> → telegramUserId yoziladi, raqam so'raladi.
 *  3. Foydalanuvchi O'Z raqamini yuboradi → phone/name yoziladi (status: done).
 *  4. Ilova so'rab turadi va tasdiq chiptasini oladi; ro'yxatdan o'tishda chipta ishlatiladi (status: used).
 * Yozuv `expiresAt` da avtomatik o'chadi (TTL indeks).
 */
export interface ITgSignup {
  nonce: string;
  status: 'pending' | 'done' | 'used';
  telegramUserId?: string;
  chatId?: string;
  /** Kanonik telefon (+998XXXXXXXXX) — Telegram kontakti, foydalanuvchining o'z raqami */
  phone?: string;
  name?: string;
  expiresAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export const tgSignupSchema = new Schema<ITgSignup>(
  {
    nonce: { type: String, required: true, unique: true },
    status: { type: String, enum: ['pending', 'done', 'used'], default: 'pending' },
    telegramUserId: { type: String, index: true, sparse: true },
    chatId: { type: String },
    phone: { type: String },
    name: { type: String, maxlength: 80 },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  },
  { timestamps: true, collection: 'tg_signups' },
);

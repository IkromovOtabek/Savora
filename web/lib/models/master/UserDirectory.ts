import { Schema, Types } from 'mongoose';

/**
 * Global login registri (master DB).
 *
 * Har bir do'kon (tenant) o'z bazasida yashaydi va u yerda username faqat SHU do'kon
 * ichida yagona. Slug'siz "login + parol" bilan kirish uchun esa username butun
 * platforma bo'yicha YAGONA bo'lishi va qaysi do'konga tegishli ekani bir so'rovda
 * aniqlanishi kerak. Shu registr aynan shuni beradi:
 *   username -> { organizationId, dbName }.
 *
 * Manba haqiqati (source of truth) — tenant DB'dagi `users`. Bu yerda faqat
 * autentifikatsiya uchun global indeks; `username` unique indeksi ikki do'konda
 * bir xil login yaratilishini bazaviy darajada bloklaydi (atomik).
 */
export interface IUserDirectory {
  username: string;
  organizationId: Types.ObjectId;
  dbName: string;
  role: 'admin' | 'user';
  branchId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export const userDirectorySchema = new Schema<IUserDirectory>(
  {
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    organizationId: { type: Schema.Types.ObjectId, required: true, index: true },
    dbName: { type: String, required: true },
    role: { type: String, enum: ['admin', 'user'], default: 'user' },
    branchId: { type: String },
  },
  { timestamps: true, collection: 'user_directory' }
);

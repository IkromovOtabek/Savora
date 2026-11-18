import { Schema } from 'mongoose';

/**
 * E-commerce xaridori (master baza) — do'kon foydalanuvchisidan butunlay alohida akkaunt.
 * Kirish: telefon + parol (bcrypt). tokenVersion — parol almashsa eski sessiya/token bekor bo'ladi.
 */
export interface IBuyer {
  name: string;
  /** Kanonik telefon (+998XXXXXXXXX) — noyob */
  phone: string;
  password: string;
  tokenVersion: number;
  /** Oxirgi yetkazish manzili (keyingi buyurtmada to'ldiriladi) */
  address?: string;
  active: boolean;
  lastLoginAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export const buyerSchema = new Schema<IBuyer>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    phone: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true },
    tokenVersion: { type: Number, default: 0 },
    address: { type: String, trim: true, maxlength: 300 },
    active: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
  },
  { timestamps: true, collection: 'buyers' },
);

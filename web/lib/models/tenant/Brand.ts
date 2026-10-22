import { Schema, Types } from 'mongoose';
import { softDeletePlugin } from '../../softDelete';
import { CATALOG_COLLATION } from './ProductCategory';

/** Brend ro'yxati — mahsulotda nomi (`brand`) saqlanadi, bu yerda tanlash uchun ro'yxat. */
export interface IBrand {
  name: string;
  createdBy: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export const BRAND_NAME_MAX = 60;

export const brandSchema = new Schema<IBrand>(
  {
    name: { type: String, required: true, trim: true, maxlength: BRAND_NAME_MAX },
    createdBy: { type: String, required: true, trim: true },
  },
  { timestamps: true, collection: 'brands' }
);

// Takror brend bo'lmaydi (katta-kichik harfsiz); o'chirilganda nomga ~DEL~ qo'shiladi
brandSchema.index({ name: 1 }, { unique: true, collation: CATALOG_COLLATION });
brandSchema.plugin(softDeletePlugin);

export type BrandDoc = IBrand & { _id: Types.ObjectId };

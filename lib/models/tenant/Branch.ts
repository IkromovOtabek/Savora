import { Schema, Types } from 'mongoose';

export interface IBranch {
  name: string;
  address?: string;
  phone?: string;
  active: boolean;
  /** Biznes egasi (admin) ombori — login yo'q, Filiallar ro'yxatida ko'rsatilmaydi.
   *  Admin qo'shgan mahsulotlar shu yerda turadi, "Filialga berish" orqali filiallarga o'tkaziladi. */
  isMain?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export const branchSchema = new Schema<IBranch>(
  {
    name: { type: String, required: true, trim: true },
    address: { type: String, trim: true },
    phone: { type: String, trim: true },
    active: { type: Boolean, default: true },
    isMain: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'branches' }
);

export type BranchDoc = IBranch & { _id: Types.ObjectId };

import { Schema, Types } from 'mongoose';

export interface IBranch {
  name: string;
  address?: string;
  phone?: string;
  active: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export const branchSchema = new Schema<IBranch>(
  {
    name: { type: String, required: true, trim: true },
    address: { type: String, trim: true },
    phone: { type: String, trim: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'branches' }
);

export type BranchDoc = IBranch & { _id: Types.ObjectId };

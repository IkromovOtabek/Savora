import { Schema, Types } from 'mongoose';

export interface ICreditBank {
  name: string;
  active: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export const creditBankSchema = new Schema<ICreditBank>(
  {
    name: { type: String, required: true, trim: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'credit_banks' }
);

creditBankSchema.index({ name: 1 }, { unique: true });

export type CreditBankDoc = ICreditBank & { _id: Types.ObjectId };

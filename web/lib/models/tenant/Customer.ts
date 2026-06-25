import { Schema, Types } from 'mongoose';

export interface ICustomer {
  fullName: string;
  phone: string;
  address?: string;
  notes?: string;
  photoUrl?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export const customerSchema = new Schema<ICustomer>(
  {
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    address: { type: String, trim: true },
    notes: { type: String, trim: true },
    photoUrl: { type: String, trim: true },
  },
  { timestamps: true, collection: 'customers' }
);

customerSchema.index({ phone: 1 });
customerSchema.index({ fullName: 'text', phone: 'text' });

export type CustomerDoc = ICustomer & { _id: Types.ObjectId };

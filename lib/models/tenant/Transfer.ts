import { Schema, Types } from 'mongoose';

export interface ITransfer {
  transferNo: string;
  productId: Types.ObjectId;
  productSnapshot: {
    name: string;
    imei: string;
  };
  quantity: number;
  fromBranchId?: Types.ObjectId;
  fromBranchName?: string;
  toBranchId: Types.ObjectId;
  toBranchName: string;
  transferredBy: string;
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export const transferSchema = new Schema<ITransfer>(
  {
    transferNo: { type: String, required: true, unique: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    productSnapshot: {
      name: { type: String, required: true },
      imei: { type: String, required: true },
    },
    quantity: { type: Number, required: true, min: 1, default: 1 },
    fromBranchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
    fromBranchName: { type: String, trim: true },
    toBranchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
    toBranchName: { type: String, required: true, trim: true },
    transferredBy: { type: String, required: true, trim: true },
    notes: { type: String, trim: true },
  },
  { timestamps: true, collection: 'transfers' }
);

transferSchema.index({ createdAt: -1 });
transferSchema.index({ toBranchId: 1 });

export type TransferDoc = ITransfer & { _id: Types.ObjectId };

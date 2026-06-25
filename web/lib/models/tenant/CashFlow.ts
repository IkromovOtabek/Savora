import { Schema, Types } from 'mongoose';

export type CashFlowType = 'income' | 'expense';

export interface ICashFlow {
  type: CashFlowType;
  amount: number;
  description: string;
  recordedBy: string;
  /** Admin pul olgan filial (ixtiyoriy) */
  branchId?: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

export const cashFlowSchema = new Schema<ICashFlow>(
  {
    type: { type: String, enum: ['income', 'expense'], required: true },
    amount: { type: Number, required: true, min: 0 },
    description: { type: String, required: true, trim: true },
    recordedBy: { type: String, required: true, trim: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true, collection: 'cash_flows' }
);

cashFlowSchema.index({ createdAt: -1 });
cashFlowSchema.index({ type: 1, createdAt: -1 });

export const CASH_FLOW_TYPE_LABELS: Record<CashFlowType, string> = {
  income: 'Kirim',
  expense: 'Chiqim',
};

export type CashFlowDoc = ICashFlow & { _id: Types.ObjectId };

import { Schema, Types } from 'mongoose';

export type PaymentType = 'cash' | 'debt' | 'installment' | 'bank_credit';
export type SaleStatus = 'paid' | 'partial' | 'cancelled';

export interface ISalePayment {
  amount: number;
  paidAt: Date;
  note?: string;
  recordedBy?: string;
}

export interface IProductSnapshot {
  name: string;
  imei: string;
  brand?: string;
  deviceModel?: string;
  purchasePrice?: number;
  saleQuantity?: number;
}

export interface ICustomerSnapshot {
  fullName: string;
  phone: string;
}

export interface ISale {
  saleNo: string;
  productId: Types.ObjectId;
  productSnapshot: IProductSnapshot;
  customerId?: Types.ObjectId;
  customerSnapshot?: ICustomerSnapshot;
  branchId: Types.ObjectId;
  paymentType: PaymentType;
  bankName?: string;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  installmentMonths?: number;
  status: SaleStatus;
  payments: ISalePayment[];
  soldBy: string;
  notes?: string;
  photoUrl?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export const saleSchema = new Schema<ISale>(
  {
    saleNo: { type: String, required: true, unique: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    productSnapshot: {
      name: { type: String, required: true },
      imei: { type: String, required: true },
      brand: { type: String },
      deviceModel: { type: String },
      purchasePrice: { type: Number, min: 0 },
      saleQuantity: { type: Number, min: 1, default: 1 },
    },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer' },
    customerSnapshot: {
      fullName: { type: String, trim: true },
      phone: { type: String, trim: true },
    },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
    paymentType: { type: String, enum: ['cash', 'debt', 'installment', 'bank_credit'], required: true },
    bankName: { type: String, trim: true },
    totalAmount: { type: Number, required: true, min: 0 },
    paidAmount: { type: Number, required: true, min: 0, default: 0 },
    remainingAmount: { type: Number, required: true, min: 0, default: 0 },
    installmentMonths: { type: Number, min: 1, max: 60 },
    status: { type: String, enum: ['paid', 'partial', 'cancelled'], default: 'paid' },
    payments: [{
      amount: { type: Number, required: true, min: 0 },
      paidAt: { type: Date, required: true, default: Date.now },
      note: { type: String, trim: true },
      recordedBy: { type: String, trim: true },
    }],
    soldBy: { type: String, required: true, trim: true },
    notes: { type: String, trim: true },
    photoUrl: { type: String, trim: true },
  },
  { timestamps: true, collection: 'sales' }
);

saleSchema.index({ createdAt: -1 });
saleSchema.index({ status: 1, paymentType: 1 });
saleSchema.index({ 'productSnapshot.imei': 1 });

export const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  cash: 'Naqd',
  debt: 'Qarz',
  installment: 'Nasiya (bo\'lib to\'lash)',
  bank_credit: 'Bank krediti',
};

export const SALE_STATUS_LABELS: Record<SaleStatus, string> = {
  paid: "To'liq to'langan",
  partial: 'Qisman / qarzdor',
  cancelled: 'Bekor qilingan',
};

export type SaleDoc = ISale & { _id: Types.ObjectId };

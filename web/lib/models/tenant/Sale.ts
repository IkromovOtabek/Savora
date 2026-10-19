import { Schema, Types } from 'mongoose';
import { PRODUCT_UNITS, type ProductUnit } from '../../businessTypes';

export type PaymentType = 'cash' | 'debt' | 'installment' | 'bank_credit';
export type SaleStatus = 'paid' | 'partial' | 'cancelled';

export interface ISalePayment {
  amount: number;
  paidAt: Date;
  note?: string;
  recordedBy?: string;
}

/** Qisman qaytarish yozuvi — sotuvdan bir necha dona qaytarilganda (to'liq qaytarish = bekor qilish) */
export interface ISaleReturn {
  qty: number;
  /** Qaytgan mahsulot qiymati (sotuv narxi bo'yicha) */
  amount: number;
  /** Shundan qarzdan kamaytirilgani */
  debtReduced: number;
  /** Shundan mijozga naqd qaytarilgani (kassadan chiqim) */
  refundAmount: number;
  reason?: string;
  returnedAt: Date;
  by: string;
}

export interface IProductSnapshot {
  name: string;
  imei: string;
  brand?: string;
  deviceModel?: string;
  purchasePrice?: number;
  saleQuantity?: number;
  /** Sotuv paytidagi o'lchov birligi — kasr qaytarish va chekda "1,5 kg" uchun */
  unit?: ProductUnit;
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
  /** Nasiya boshlang'ich to'lovi (sotuv paytida) — oy jadvali shu asosda hisoblanadi */
  downPayment?: number;
  dueDate?: Date;
  status: SaleStatus;
  /** Nasiya muddat o'tgan eslatmasi oxirgi yuborilgan sana (kunlik dedup uchun) */
  lastInstallmentNotifiedAt?: Date;
  payments: ISalePayment[];
  returns?: ISaleReturn[];
  soldBy: string;
  notes?: string;
  photoUrl?: string;
  /** Oflayn POS: qurilma bergan noyob kalit — bir sotuv ikki marta yozilmasin (idempotentlik) */
  clientSaleId?: string;
  /** Oflayn qilingan va keyin sinxronlangan sotuv */
  offline?: boolean;
  syncedAt?: Date;
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
      saleQuantity: { type: Number, min: 0.001, default: 1 },
      unit: { type: String, enum: PRODUCT_UNITS },
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
    downPayment: { type: Number, min: 0 },
    dueDate: { type: Date },
    lastInstallmentNotifiedAt: { type: Date },
    status: { type: String, enum: ['paid', 'partial', 'cancelled'], default: 'paid' },
    payments: [{
      amount: { type: Number, required: true, min: 0 },
      paidAt: { type: Date, required: true, default: Date.now },
      note: { type: String, trim: true },
      recordedBy: { type: String, trim: true },
    }],
    returns: [{
      qty: { type: Number, required: true, min: 0.001 },
      amount: { type: Number, required: true, min: 0 },
      debtReduced: { type: Number, required: true, min: 0, default: 0 },
      refundAmount: { type: Number, required: true, min: 0, default: 0 },
      reason: { type: String, trim: true },
      returnedAt: { type: Date, required: true, default: Date.now },
      by: { type: String, required: true, trim: true },
    }],
    soldBy: { type: String, required: true, trim: true },
    notes: { type: String, trim: true },
    photoUrl: { type: String, trim: true },
    clientSaleId: { type: String, trim: true, maxlength: 64 },
    offline: { type: Boolean },
    syncedAt: { type: Date },
  },
  { timestamps: true, collection: 'sales' }
);

saleSchema.index({ createdAt: -1 });
saleSchema.index({ branchId: 1, createdAt: -1 }); // filial bo'yicha scoping/hisobot uchun
saleSchema.index({ status: 1, paymentType: 1 });
saleSchema.index({ status: 1, dueDate: 1 });
saleSchema.index({ 'productSnapshot.imei': 1 });
saleSchema.index({ branchId: 1, 'returns.returnedAt': -1 }); // kunlik kassa (qaytarilgan pul)
// Faqat oflayn sotuvlarda bor — partial unique (null'lar to'qnashmaydi)
saleSchema.index({ clientSaleId: 1 }, { unique: true, partialFilterExpression: { clientSaleId: { $type: 'string' } } });

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

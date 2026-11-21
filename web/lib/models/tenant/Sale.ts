import { Schema, Types } from 'mongoose';
import { PRODUCT_UNITS, type ProductUnit } from '../../businessTypes';
import { PAY_METHODS, type PayMethod } from '../../payMethods';

export type PaymentType = 'cash' | 'debt' | 'installment' | 'bank_credit';
export type SaleStatus = 'paid' | 'partial' | 'cancelled';

export interface ISalePayment {
  amount: number;
  paidAt: Date;
  note?: string;
  recordedBy?: string;
  /** To'lov usuli; yo'q bo'lsa — naqd (eski yozuvlar) */
  method?: PayMethod;
  /** Nasiya: to'lov qaysi oylarga tushdi (chek uchun); eski yozuvlarda yo'q — izohdan */
  months?: { from: number; to: number; partialLast: boolean };
  /** Nasiya: qisman to'lovda oydan yetmagan summa keyingi oylarga bo'lingan bo'lsa */
  carry?: { amount: number; from: number; to: number };
  /** To'lovdan keyingi qoldiq (chek uchun); eski yozuvlarda yo'q */
  balanceAfter?: number;
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

/** Bank krediti: sotuvning bank moliyalashtirgan qismi — bir nechta bank bo'lishi mumkin */
export interface ISaleBankPart {
  bankName: string;
  /** Shu bank zimmasidagi summa (so'm) — Kredit kassada "Kiritilgan" bo'lib hisoblanadi */
  amount: number;
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
  /** Sotuv paytidagi MXIK (IKPU) — chekda; yo'q bo'lsa chek mahsulotning joriy MXIK'ini ko'rsatadi */
  ikpu?: string;
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
  /** Bank nomi (bir nechta bo'lsa — vergul bilan, ko'rsatish uchun). Hisob-kitob — bankParts bo'yicha */
  bankName?: string;
  /** Bank ulushlari; yo'q bo'lsa (eski sotuv) — bankName + remainingAmount (lib/bankCredit.ts) */
  bankParts?: ISaleBankPart[];
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  installmentMonths?: number;
  /** Nasiya: har oyning qaysi kuni to'lanadi (1–31; qisqa oyda — oy oxiri). Yo'q — sotuv sanasi + N oy */
  payDay?: number;
  /**
   * Nasiya: oylar bo'yicha summalar — qisman to'lovda oy yopilib, yetmagani keyingi oylarga bo'linganda yoziladi.
   * Yo'q bo'lsa — teng bo'linadi (lib/installment).
   */
  installmentAmounts?: number[];
  /** Nasiya boshlang'ich to'lovi (sotuv paytida) — oy jadvali shu asosda hisoblanadi */
  downPayment?: number;
  dueDate?: Date;
  status: SaleStatus;
  /** Bekor qilingan vaqt (yangi yozuvlar) — to'lovlar realizatsiya bo'lib qoladi, qaytarilgani kassadan chiqim */
  cancelledAt?: Date;
  cancelledBy?: string;
  /** Bekor qilishda mijozga qaytarilgan summa (Moliya: «Sotuv bekor qilindi» chiqimi) */
  cancelRefund?: number;
  /** Nasiya muddat o'tgan eslatmasi oxirgi yuborilgan sana (kunlik dedup uchun) */
  lastInstallmentNotifiedAt?: Date;
  payments: ISalePayment[];
  returns?: ISaleReturn[];
  soldBy: string;
  notes?: string;
  photoUrl?: string;
  /** Bitta xarid (kassa savatchasi) qatorlarini bog'laydi; ochiq chek havolasi shu kalit bilan */
  checkoutId?: string;
  /** Shu qatorga tushgan chegirma (so'm) — chekda ko'rsatish uchun; totalAmount allaqachon chegirmali */
  discount?: number;
  /** Oflayn POS: qurilma bergan noyob kalit — bir sotuv ikki marta yozilmasin (idempotentlik) */
  clientSaleId?: string;
  /** Oflayn qilingan va keyin sinxronlangan sotuv */
  offline?: boolean;
  syncedAt?: Date;
  /** Restoran: qaysi buyurtmadan (Order) — to'lovda har taom alohida qator, umumiy checkoutId */
  orderId?: Types.ObjectId;
  /** Restoran: stol raqami (chek va hisobot uchun nusxa) */
  tableNumber?: number;
  /** Restoran saboyi: qaysi stol mehmonlariga (chekda «Saboy: 5-stol»; stol bandligi emas) */
  forTableNumber?: number;
  /**
   * Markirovka kodlari (GS1 DataMatrix, kanonik ko'rinish — GS = \x1d, lib/gs1.ts) — har dona uchun bittadan.
   * Fiskal uzatish keyingi bosqichda (virtual kassa); hozir chekda belgisi va takror sotuvni bloklash uchun.
   */
  markingCodes?: string[];
  /** Takror tekshiruvi kalitlari: 01<GTIN>21<seriya> (markingCodes bilan bir tartibda) */
  markingKeys?: string[];
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
      ikpu: { type: String, trim: true, maxlength: 30 },
    },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer' },
    customerSnapshot: {
      fullName: { type: String, trim: true },
      phone: { type: String, trim: true },
    },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
    paymentType: { type: String, enum: ['cash', 'debt', 'installment', 'bank_credit'], required: true },
    bankName: { type: String, trim: true },
    bankParts: {
      type: [{
        _id: false,
        bankName: { type: String, required: true, trim: true },
        amount: { type: Number, required: true, min: 0 },
      }],
      default: undefined,
    },
    totalAmount: { type: Number, required: true, min: 0 },
    paidAmount: { type: Number, required: true, min: 0, default: 0 },
    remainingAmount: { type: Number, required: true, min: 0, default: 0 },
    installmentMonths: { type: Number, min: 1, max: 60 },
    payDay: { type: Number, min: 1, max: 31 },
    installmentAmounts: { type: [Number], default: undefined },
    downPayment: { type: Number, min: 0 },
    dueDate: { type: Date },
    lastInstallmentNotifiedAt: { type: Date },
    status: { type: String, enum: ['paid', 'partial', 'cancelled'], default: 'paid' },
    cancelledAt: { type: Date },
    cancelledBy: { type: String, trim: true },
    cancelRefund: { type: Number, min: 0 },
    payments: [{
      amount: { type: Number, required: true, min: 0 },
      paidAt: { type: Date, required: true, default: Date.now },
      note: { type: String, trim: true },
      recordedBy: { type: String, trim: true },
      method: { type: String, enum: PAY_METHODS },
      months: {
        type: { _id: false, from: { type: Number, min: 1 }, to: { type: Number, min: 1 }, partialLast: { type: Boolean } },
        default: undefined,
      },
      carry: {
        type: { _id: false, amount: { type: Number, min: 0 }, from: { type: Number, min: 1 }, to: { type: Number, min: 1 } },
        default: undefined,
      },
      balanceAfter: { type: Number, min: 0 },
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
    checkoutId: { type: String, trim: true, maxlength: 32 },
    discount: { type: Number, min: 0 },
    clientSaleId: { type: String, trim: true, maxlength: 64 },
    offline: { type: Boolean },
    syncedAt: { type: Date },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order' },
    tableNumber: { type: Number },
    forTableNumber: { type: Number },
    markingCodes: { type: [{ type: String, maxlength: 200 }], default: undefined },
    markingKeys: { type: [{ type: String, maxlength: 60 }], default: undefined },
  },
  { timestamps: true, collection: 'sales' }
);

saleSchema.index({ createdAt: -1 });
saleSchema.index({ branchId: 1, createdAt: -1 }); // filial bo'yicha scoping/hisobot uchun
saleSchema.index({ status: 1, paymentType: 1 });
saleSchema.index({ status: 1, dueDate: 1 });
saleSchema.index({ 'productSnapshot.imei': 1 });
saleSchema.index({ customerId: 1, createdAt: -1 }); // mijoz kartochkasi: xaridlar tarixi va 360° xulosa
saleSchema.index({ checkoutId: 1 }, { partialFilterExpression: { checkoutId: { $type: 'string' } } });
saleSchema.index({ branchId: 1, 'returns.returnedAt': -1 }); // kunlik kassa (qaytarilgan pul)
// Faqat oflayn sotuvlarda bor — partial unique (null'lar to'qnashmaydi)
saleSchema.index({ clientSaleId: 1 }, { unique: true, partialFilterExpression: { clientSaleId: { $type: 'string' } } });
// Restoran buyurtmasining sotuv qatorlari
saleSchema.index({ orderId: 1 }, { partialFilterExpression: { orderId: { $type: 'objectId' } } });
// Markirovka kodi do'kon bo'yicha bir marta sotiladi — kassada takror tekshiruvi (lib/marking.ts → soldMarkingConflict)
saleSchema.index({ markingKeys: 1 }, { sparse: true });

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

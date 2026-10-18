import { Schema, Types } from 'mongoose';
import { softDeletePlugin } from '../../softDelete';

/** Yetkazib beruvchi (tovar olinadigan firma/shaxs). Do'kon bo'yicha umumiy — filialga bog'lanmaydi. */
export interface ISupplier {
  name: string;
  phone?: string;
  company?: string;
  notes?: string;
  createdBy: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export const supplierSchema = new Schema<ISupplier>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, trim: true, maxlength: 40 },
    company: { type: String, trim: true, maxlength: 120 },
    notes: { type: String, trim: true, maxlength: 500 },
    createdBy: { type: String, required: true, trim: true },
  },
  { timestamps: true, collection: 'suppliers' }
);

supplierSchema.index({ name: 1 });
supplierSchema.plugin(softDeletePlugin);

export type SupplierDoc = ISupplier & { _id: Types.ObjectId };

/**
 * Yetkazib beruvchi bilan hisob-kitob yozuvi:
 *  - purchase — tovar olindi (biz qarzdor bo'ldik, +)
 *  - payment  — pul to'landi (qarz kamaydi, −)
 * Qarz = Σ purchase − Σ payment.
 */
export type SupplierEntryType = 'purchase' | 'payment';

export interface ISupplierEntry {
  supplierId: Types.ObjectId;
  type: SupplierEntryType;
  amount: number;
  note?: string;
  /** Avtomatik yozuv bo'lsa — qaysi mahsulot qabulidan */
  productId?: Types.ObjectId;
  at: Date;
  by: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export const supplierEntrySchema = new Schema<ISupplierEntry>(
  {
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true },
    type: { type: String, enum: ['purchase', 'payment'], required: true },
    amount: { type: Number, required: true, min: 1 },
    note: { type: String, trim: true, maxlength: 300 },
    productId: { type: Schema.Types.ObjectId, ref: 'Product' },
    at: { type: Date, required: true, default: Date.now },
    by: { type: String, required: true, trim: true },
  },
  { timestamps: true, collection: 'supplier_entries' }
);

supplierEntrySchema.index({ supplierId: 1, at: -1 });
// Xato yozuvni o'chirish ham soft-delete — qarz tarixi izsiz yo'qolmaydi
supplierEntrySchema.plugin(softDeletePlugin);

export type SupplierEntryDoc = ISupplierEntry & { _id: Types.ObjectId };

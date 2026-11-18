import { Schema, Types } from 'mongoose';
import { PRODUCT_UNITS, type ProductUnit } from '../../businessTypes';
import type { IRecipeItem, IRecipeOperation } from './Recipe';

/**
 * Ishlab chiqarish akti — docs/SEX_API.md. Holatlar: draft → in_progress → done; draft/in_progress → cancelled.
 *
 * «Bajarildi» (done) da: xom ashyo `fromBranchId` dan atomik chiqadi (haqiqiy sarf `materials[].actualQty`),
 * tayyor mahsulot `toBranchId` ga kirim bo'ladi (topilmasa — barqaror kod bo'yicha yaratiladi), brak —
 * StockAdjustment (production_scrap) hujjati, tannarx = materiallar (o'rtacha narx) + ish haqi + ustama.
 */
export const PRODUCTION_STATUSES = ['draft', 'in_progress', 'done', 'cancelled'] as const;
export type ProductionStatus = (typeof PRODUCTION_STATUSES)[number];

export interface IProductionMaterial {
  _id?: Types.ObjectId;
  /** Barqaror kod (texkartadan); qo'shimcha qatorda — mahsulot kodi */
  code: string;
  /** `fromBranchId` dagi mahsulot hujjati (akt ochilganda topiladi; yo'q bo'lsa — bajarishda xato) */
  productId?: Types.ObjectId;
  name: string;
  unit?: ProductUnit;
  /** Reja (texkarta × reja miqdori, yo'qotish bilan); qo'shimcha qatorda 0 */
  plannedQty: number;
  /** Haqiqiy sarf — standart = reja, akt yopilguncha tuzatiladi; 0 — ishlatilmadi */
  actualQty: number;
  /** Bajarilganda: o'rtacha kelish narxi (asosiy birlik) va qator qiymati */
  unitCost?: number;
  cost?: number;
  /** Texkartada yo'q, qo'lda qo'shilgan (almashtirish) */
  extra?: boolean;
}

export interface IProductionLabor {
  _id?: Types.ObjectId;
  operation: string;
  /** Ixtiyoriy: kim bajargani (ma'lumot uchun; ishbay to'lovi — PieceworkEntry) */
  workerId?: Types.ObjectId;
  workerName?: string;
  qty: number;
  rate: number;
  amount: number;
}

export interface IRecipeSnapshot {
  recipeId: Types.ObjectId;
  name: string;
  version: number;
  outputCode: string;
  outputName: string;
  outputQty: number;
  unit?: ProductUnit;
  items: IRecipeItem[];
  operations: IRecipeOperation[];
  overheadPerUnit: number;
}

export interface IProductionOrder {
  /** P20261118-0001 */
  docNo: string;
  status: ProductionStatus;
  recipeId: Types.ObjectId;
  recipeSnapshot: IRecipeSnapshot;
  plannedQty: number;
  /** Bajarilganda: yaroqli tayyor mahsulot va brak (asosiy birlikda) */
  producedQty?: number;
  scrapQty?: number;
  /** Xom ashyo ombori va tayyor mahsulot ombori (bir xil bo'lishi mumkin) */
  fromBranchId: Types.ObjectId;
  toBranchId: Types.ObjectId;
  materials: IProductionMaterial[];
  labor: IProductionLabor[];
  /** Ish haqi qo'lda tahrirlangan — «bajarildi»da texkartadan qayta hisoblanmaydi */
  laborManual?: boolean;
  /** Tannarx (bajarilganda): materiallar + ish haqi + ustama; unitCost = costTotal / (produced + scrap) */
  materialsCost?: number;
  laborCost?: number;
  overheadCost?: number;
  costTotal?: number;
  unitCost?: number;
  /** Brak qiymati (scrapQty × unitCost, zarar sifatida StockAdjustment'da) */
  scrapCost?: number;
  /** Kirim bo'lgan tayyor mahsulot hujjati (`toBranchId` da) */
  outputProductId?: Types.ObjectId;
  /** Brak hujjati raqami (HC-…) */
  scrapDocNo?: string;
  /** Topshirish muddati — kalendar kuni (UTC yarim tunda saqlanadi; «muddati o'tgan» — Toshkent kuni bo'yicha) */
  dueDate?: Date;
  /** Mijoz buyurtmasi (kim uchun, buyurtma raqami) — ixtiyoriy */
  customerRef?: string;
  note?: string;
  /** Idempotentlik kaliti (takroriy «yaratish» bosilsa — o'sha akt qaytadi) */
  clientId?: string;
  createdBy: string;
  startedAt?: Date;
  startedBy?: string;
  completedAt?: Date;
  completedBy?: string;
  cancelledAt?: Date;
  cancelledBy?: string;
  cancelReason?: string;
  /** «Bajarildi» jarayoni qulfi (ikki marta bosilsa ikki marta chiqmasin); tugagach olib tashlanadi */
  postingAt?: Date;
  /** Optimistik qulf */
  rev: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const recipeItemSnap = new Schema(
  {
    code: { type: String, required: true },
    name: { type: String, required: true },
    qty: { type: Number, required: true },
    unit: { type: String, enum: PRODUCT_UNITS },
    lossPct: { type: Number, default: 0 },
  },
  { _id: false },
);
const recipeOpSnap = new Schema(
  { name: { type: String, required: true }, rate: { type: Number, default: 0 }, normMin: { type: Number } },
  { _id: false },
);

const materialSchema = new Schema<IProductionMaterial>({
  code: { type: String, required: true, trim: true, uppercase: true },
  productId: { type: Schema.Types.ObjectId, ref: 'Product' },
  name: { type: String, required: true, trim: true },
  unit: { type: String, enum: PRODUCT_UNITS },
  plannedQty: { type: Number, default: 0, min: 0 },
  actualQty: { type: Number, default: 0, min: 0 },
  unitCost: { type: Number, min: 0 },
  cost: { type: Number, min: 0 },
  extra: { type: Boolean },
});

const laborSchema = new Schema<IProductionLabor>({
  operation: { type: String, required: true, trim: true, maxlength: 80 },
  workerId: { type: Schema.Types.ObjectId, ref: 'User' },
  workerName: { type: String, trim: true },
  qty: { type: Number, default: 0, min: 0 },
  rate: { type: Number, default: 0, min: 0 },
  amount: { type: Number, default: 0, min: 0 },
});

export const productionOrderSchema = new Schema<IProductionOrder>(
  {
    docNo: { type: String, required: true, trim: true },
    status: { type: String, enum: PRODUCTION_STATUSES, default: 'draft' },
    recipeId: { type: Schema.Types.ObjectId, ref: 'Recipe', required: true },
    recipeSnapshot: {
      recipeId: { type: Schema.Types.ObjectId, required: true },
      name: { type: String, required: true },
      version: { type: Number, required: true },
      outputCode: { type: String, required: true },
      outputName: { type: String, required: true },
      outputQty: { type: Number, required: true },
      unit: { type: String, enum: PRODUCT_UNITS },
      items: { type: [recipeItemSnap], default: [] },
      operations: { type: [recipeOpSnap], default: [] },
      overheadPerUnit: { type: Number, default: 0 },
    },
    plannedQty: { type: Number, required: true, min: 0.001 },
    producedQty: { type: Number, min: 0 },
    scrapQty: { type: Number, min: 0 },
    fromBranchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
    toBranchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
    materials: { type: [materialSchema], default: [] },
    labor: { type: [laborSchema], default: [] },
    laborManual: { type: Boolean },
    materialsCost: { type: Number, min: 0 },
    laborCost: { type: Number, min: 0 },
    overheadCost: { type: Number, min: 0 },
    costTotal: { type: Number, min: 0 },
    unitCost: { type: Number, min: 0 },
    scrapCost: { type: Number, min: 0 },
    outputProductId: { type: Schema.Types.ObjectId, ref: 'Product' },
    scrapDocNo: { type: String, trim: true },
    dueDate: { type: Date },
    customerRef: { type: String, trim: true, maxlength: 160 },
    note: { type: String, trim: true, maxlength: 500 },
    clientId: { type: String, trim: true },
    createdBy: { type: String, required: true, trim: true },
    startedAt: { type: Date },
    startedBy: { type: String, trim: true },
    completedAt: { type: Date },
    completedBy: { type: String, trim: true },
    cancelledAt: { type: Date },
    cancelledBy: { type: String, trim: true },
    cancelReason: { type: String, trim: true, maxlength: 300 },
    postingAt: { type: Date },
    rev: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'production_orders' },
);

productionOrderSchema.index({ docNo: 1 }, { unique: true });
productionOrderSchema.index({ status: 1, createdAt: -1 });
productionOrderSchema.index({ fromBranchId: 1, createdAt: -1 });
productionOrderSchema.index({ toBranchId: 1, createdAt: -1 });
productionOrderSchema.index({ recipeId: 1, createdAt: -1 });
productionOrderSchema.index({ status: 1, dueDate: 1 }, { partialFilterExpression: { dueDate: { $type: 'date' } } });
productionOrderSchema.index({ clientId: 1 }, { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } });

export type ProductionOrderDoc = IProductionOrder & { _id: Types.ObjectId };

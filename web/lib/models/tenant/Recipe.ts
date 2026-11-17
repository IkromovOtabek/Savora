import { Schema, Types } from 'mongoose';
import { PRODUCT_UNITS, type ProductUnit } from '../../businessTypes';

/**
 * Texkarta (BOM, sarf normasi) — docs/SEX_API.md. 1 daraja: xom ashyo → tayyor mahsulot.
 *
 * Mahsulotlar filialdan MUSTAQIL barqaror kod bilan bog'lanadi (`Product.itemCode`, yo'q bo'lsa `productId`):
 * texkarta qaysi filialda ishlatilsa, shu filialdagi bir xil kodli hujjat olinadi (transferdan keyin uzilmaydi).
 *
 * `mode`: production — sex BOM'i (hozir ishlatiladi); onSale — restoran texkartasi (sotuvda tarkib ayriladi,
 * keyingi bosqich; hozir mavjud `Product.kind = 'bundle'` ishlaydi).
 *
 * Versiya: tarkib (chiqish, xom ashyo, operatsiya, ustama) o'zgarsa `version` +1, eskisi `prevVersions` ga
 * (oxirgi 20 ta). Nom/izoh/faollik o'zgarishi versiyani oshirmaydi. Ishlab chiqarish akti ochilganda texkarta
 * nusxasi (`recipeSnapshot`) aktga yoziladi — keyingi tahrirlar eski aktlarni o'zgartirmaydi.
 */
export const RECIPE_MODES = ['production', 'onSale'] as const;
export type RecipeMode = (typeof RECIPE_MODES)[number];

export interface IRecipeItem {
  /** Xom ashyo barqaror kodi (Product.itemCode) */
  code: string;
  /** Ko'rsatish uchun nom (saqlangandagi) */
  name: string;
  /** `outputQty` dona/kg tayyor mahsulot uchun sarf (asosiy birlikda), yo'qotishsiz */
  qty: number;
  /** Xom ashyoning asosiy birligi (saqlangandagi) */
  unit?: ProductUnit;
  /** Me'yoriy yo'qotish, % (0–90): talab = qty × (1 + lossPct/100) */
  lossPct: number;
}

export interface IRecipeOperation {
  /** Operatsiya nomi («Bichish», «Tikish») — ishbay yozuvi shu nom bilan bog'lanadi */
  name: string;
  /** 1 birlik tayyor mahsulot uchun ishbay narxi (so'm) */
  rate: number;
  /** 1 birlik uchun me'yoriy vaqt, daqiqa (ixtiyoriy, ma'lumot uchun) */
  normMin?: number;
}

export interface IRecipeComposition {
  outputQty: number;
  items: IRecipeItem[];
  operations: IRecipeOperation[];
  /** 1 birlik tayyor mahsulotga ustama xarajat (so'm): elektr, ijara ulushi */
  overheadPerUnit: number;
}

export interface IRecipeVersion extends IRecipeComposition {
  version: number;
  changedAt: Date;
  changedBy: string;
}

export interface IRecipe extends IRecipeComposition {
  name: string;
  mode: RecipeMode;
  /** Tayyor mahsulot barqaror kodi (Product.itemCode) */
  outputCode: string;
  outputName: string;
  /** Tayyor mahsulot asosiy birligi */
  unit?: ProductUnit;
  version: number;
  prevVersions?: IRecipeVersion[];
  active: boolean;
  note?: string;
  createdBy: string;
  updatedBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const itemSchema = new Schema<IRecipeItem>(
  {
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    qty: { type: Number, required: true, min: 0.001 },
    unit: { type: String, enum: PRODUCT_UNITS },
    lossPct: { type: Number, default: 0, min: 0, max: 90 },
  },
  { _id: false },
);

const operationSchema = new Schema<IRecipeOperation>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    rate: { type: Number, default: 0, min: 0 },
    normMin: { type: Number, min: 0 },
  },
  { _id: false },
);

const compositionFields = {
  outputQty: { type: Number, required: true, min: 0.001 },
  items: { type: [itemSchema], default: [] },
  operations: { type: [operationSchema], default: [] },
  overheadPerUnit: { type: Number, default: 0, min: 0 },
};

const versionSchema = new Schema<IRecipeVersion>(
  {
    version: { type: Number, required: true },
    ...compositionFields,
    changedAt: { type: Date, required: true },
    changedBy: { type: String, required: true, trim: true },
  },
  { _id: false },
);

export const recipeSchema = new Schema<IRecipe>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    mode: { type: String, enum: RECIPE_MODES, default: 'production' },
    outputCode: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
    outputName: { type: String, required: true, trim: true, maxlength: 200 },
    unit: { type: String, enum: PRODUCT_UNITS },
    ...compositionFields,
    version: { type: Number, default: 1, min: 1 },
    prevVersions: { type: [versionSchema], default: undefined },
    active: { type: Boolean, default: true },
    note: { type: String, trim: true, maxlength: 500 },
    createdBy: { type: String, required: true, trim: true },
    updatedBy: { type: String, trim: true },
  },
  { timestamps: true, collection: 'recipes' },
);

recipeSchema.index({ active: 1, name: 1 });
recipeSchema.index({ outputCode: 1, active: 1 });
// «Bu xom ashyo qaysi texkartalarda bor» (kirim/ehtiyoj hisobi)
recipeSchema.index({ 'items.code': 1 });

export type RecipeDoc = IRecipe & { _id: Types.ObjectId };

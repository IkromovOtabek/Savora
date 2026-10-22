import { Schema, Types } from 'mongoose';
import { softDeletePlugin } from '../../softDelete';

/** Mahsulot turkumi — ichma-ich (parentId). Mahsulotda `categoryId` + `category` (nomi) saqlanadi. */
export interface IProductCategory {
  name: string;
  /** Ota turkum; yo'q bo'lsa — yuqori daraja */
  parentId?: Types.ObjectId | null;
  createdBy: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/** Ichma-ichlik chegarasi (turkum → subturkum → …) */
export const CATEGORY_MAX_DEPTH = 4;
export const CATEGORY_NAME_MAX = 60;

export const productCategorySchema = new Schema<IProductCategory>(
  {
    name: { type: String, required: true, trim: true, maxlength: CATEGORY_NAME_MAX },
    parentId: { type: Schema.Types.ObjectId, ref: 'ProductCategory', default: null },
    createdBy: { type: String, required: true, trim: true },
  },
  { timestamps: true, collection: 'product_categories' }
);

productCategorySchema.index({ parentId: 1, name: 1 });
productCategorySchema.plugin(softDeletePlugin);

export type ProductCategoryDoc = IProductCategory & { _id: Types.ObjectId };

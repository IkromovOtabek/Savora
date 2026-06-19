import { Schema, Types } from 'mongoose';

export interface IReview {
  organizationId: Types.ObjectId;
  shopName: string;
  shopSlug: string;
  rating: number;        // 1–5
  comment?: string;
  authorName?: string;   // sotuvchi yoki mijoz ismi (ixtiyoriy)
  branchName?: string;
  saleId?: string;       // takrorlanmaslik uchun
  approved: boolean;     // moderatsiya (default: true)
  createdAt?: Date;
  updatedAt?: Date;
}

export const reviewSchema = new Schema<IReview>(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, index: true },
    shopName: { type: String, required: true },
    shopSlug: { type: String, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, maxlength: 600 },
    authorName: { type: String, maxlength: 120 },
    branchName: { type: String, maxlength: 120 },
    saleId: { type: String, index: true },
    approved: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'reviews' }
);

// Landing: oxirgi tasdiqlangan baholar
reviewSchema.index({ approved: 1, createdAt: -1 });

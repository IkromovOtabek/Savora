import { Schema, Types } from 'mongoose';

/** Restoran zali (masalan «Asosiy zal», «Terassa») — filialga tegishli, stollar shu ichida */
export interface IHall {
  name: string;
  branchId: Types.ObjectId;
  /** Ko'rsatish tartibi (kichigi oldin) */
  sort: number;
  active: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export const hallSchema = new Schema<IHall>(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
    sort: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'halls' }
);

hallSchema.index({ branchId: 1, sort: 1 });

export type HallDoc = IHall & { _id: Types.ObjectId };

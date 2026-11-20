import { Schema, Types } from 'mongoose';
import { STATION_KINDS, type StationKind } from '../../restaurant/types';

/**
 * Tayyorlash stansiyasi («Issiq sex», «Bar»). Taom (Product.stationId) shu yerga yo'naladi —
 * oshxona ekrani (KDS) stansiya bo'yicha filtrlanadi. `printEnabled` — yuborilgan taomlar varag'i chop etish
 * navbatiga tushadi (PrintJob, brauzer printer stansiyasi /app/kitchen/print). `printerIp` — kelajakdagi tarmoq
 * agenti uchun (hozircha faqat saqlanadi).
 */
export interface IKitchenStation {
  branchId: Types.ObjectId;
  name: string;
  kind: StationKind;
  printerIp?: string;
  /** Avtomatik chop etish (oshxona printeri) yoqilgan */
  printEnabled?: boolean;
  sort: number;
  active: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export const kitchenStationSchema = new Schema<IKitchenStation>(
  {
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    kind: { type: String, enum: STATION_KINDS, default: 'kitchen' },
    printerIp: { type: String, trim: true, maxlength: 64 },
    printEnabled: { type: Boolean, default: false },
    sort: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'kitchen_stations' }
);

kitchenStationSchema.index({ branchId: 1, sort: 1 });

export type KitchenStationDoc = IKitchenStation & { _id: Types.ObjectId };

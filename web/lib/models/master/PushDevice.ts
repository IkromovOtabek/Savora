import { Schema, Types } from 'mongoose';

/**
 * Mobil ilova o'rnatilgan qurilma — push bildirishnoma manzili (Expo push token).
 * Ilova har kirishda/ochilishda POST /api/mobile/push bilan yozadi, chiqishda o'chiradi.
 *
 * Bitta token = bitta yozuv: telefonda boshqa foydalanuvchi kirsa, yozuv unga o'tadi.
 * `tokenVersion` — ro'yxatdan o'tgan paytdagi sessiya versiyasi: parol almashsa yoki
 * kirishlar bekor qilinsa (tokenVersion oshadi), eski qurilmaga push bormaydi.
 */
export interface IPushDevice {
  token: string;                  // ExponentPushToken[...]
  platform: 'ios' | 'android';
  dbName: string;                 // qaysi tenant bazasi
  userId: string;                 // tenant User._id
  organizationId: Types.ObjectId;
  tokenVersion: number;
  lastSeenAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export const pushDeviceSchema = new Schema<IPushDevice>(
  {
    token: { type: String, required: true, unique: true },
    platform: { type: String, enum: ['ios', 'android'], required: true },
    dbName: { type: String, required: true },
    userId: { type: String, required: true },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    tokenVersion: { type: Number, default: 0 },
    lastSeenAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true, collection: 'push_devices' }
);

pushDeviceSchema.index({ dbName: 1, userId: 1 });

export type PushDeviceDoc = IPushDevice & { _id: Types.ObjectId };

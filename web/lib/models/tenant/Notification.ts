import { Schema, Types } from 'mongoose';
import { NOTIFY_KINDS, NOTIFY_TTL_DAYS } from '../../notifyView';
import type { NotifyKind, NotifyParams } from '../../notify';

/**
 * Ilova ichidagi bildirishnoma (web qo'ng'iroqcha, mobil ro'yxat). Mantiq — lib/notify.ts.
 * Matn saqlanmaydi: `kind` + `params` (ko'ruvchi tilida lug'atdan chiqadi).
 * Kim ko'radi — `audience` bo'yicha O'QISHDA filtrlanadi (joriy huquq va filial bilan).
 */
export interface INotification {
  kind: NotifyKind;
  params: NotifyParams;
  /** Filial (bo'lmasa — butun do'kon). Filial xodimi faqat o'z filiali (yoki filialsiz) xabarini ko'radi */
  branchId?: Types.ObjectId | null;
  /** Web yo'li ('/app/...') */
  url?: string;
  audience: {
    userIds: string[];
    anyPermission: string[];
    /** Do'kon egasi(lar)i */
    admins: boolean;
  };
  /** Takrorlanmaslik kaliti (masalan `waiterCall:<tableId>`) */
  dedupeKey?: string;
  /** `dedupeKey` + vaqt oynasi raqami — NOYOB (bir vaqtdagi ikki so'rov ikkita xabar yaratmasin) */
  dedupeSlot?: string;
  /** O'qigan foydalanuvchilar (id) */
  readBy: string[];
  /** Chaqiruv «Ko'rdim» bilan yopildi — hammada o'qilgan hisoblanadi */
  resolvedAt?: Date;
  createdAt: Date;
}

export const notificationSchema = new Schema<INotification>(
  {
    kind: { type: String, enum: NOTIFY_KINDS, required: true },
    params: { type: Schema.Types.Mixed, default: {} },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', default: null },
    url: { type: String, trim: true, maxlength: 200 },
    audience: {
      userIds: { type: [String], default: [] },
      anyPermission: { type: [String], default: [] },
      admins: { type: Boolean, default: false },
    },
    dedupeKey: { type: String, trim: true, maxlength: 120 },
    dedupeSlot: { type: String, trim: true, maxlength: 160 },
    readBy: { type: [String], default: [] },
    resolvedAt: { type: Date },
    // Aniq vaqt (timestamps emas): takrorlanmaslik oynasi va «after» kursori shu maydon bo'yicha
    createdAt: { type: Date, default: Date.now, required: true },
  },
  { minimize: false },
);

// Ko'ruvchi filtri ($or: userIds | anyPermission | admins) — har tarmoq o'z indeksi bilan; yangisi tepada
notificationSchema.index({ 'audience.userIds': 1, createdAt: -1 });
notificationSchema.index({ 'audience.anyPermission': 1, createdAt: -1 });
notificationSchema.index({ 'audience.admins': 1, createdAt: -1 }, { partialFilterExpression: { 'audience.admins': true } });
// Takrorlanmaslik tekshiruvi
notificationSchema.index({ dedupeKey: 1, createdAt: -1 }, { partialFilterExpression: { dedupeKey: { $type: 'string' } } });
notificationSchema.index({ dedupeSlot: 1 }, { unique: true, partialFilterExpression: { dedupeSlot: { $type: 'string' } } });
// Avtomatik o'chirish
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: NOTIFY_TTL_DAYS * 24 * 60 * 60 });

export type NotificationDoc = INotification & { _id: Types.ObjectId };

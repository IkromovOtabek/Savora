import { Schema, Types } from 'mongoose';

/**
 * Telegram Mini App uchun shaxsiy hisob bog'lanishi.
 * Har bir Savora foydalanuvchisi (admin yoki filial) o'z Telegram'ini bog'laydi:
 *  1. Kabinet → "Telegramni ulash" → vaqtinchalik `code` yaratiladi (deep link).
 *  2. Bot `/start lu_<code>` ni qabul qiladi → `telegramUserId` yoziladi, `code` o'chadi.
 *  3. Mini App ochilganda initData.user.id → shu yozuv topiladi → sessiya beriladi.
 *
 * Bitta Telegram = bitta Savora user (oxirgi bog'lanish g'olib). Org/do'kon
 * darajasidagi bildirishnoma ulash alohida (Organization.telegramChatId).
 */
export interface ITelegramAccount {
  telegramUserId?: string;        // bog'langan Telegram foydalanuvchi id (unikal)
  code?: string;                  // kutilayotgan bog'lash kodi (claim qilingach o'chadi)
  codeExpiresAt?: Date;
  dbName: string;                 // qaysi tenant bazasi
  userId: string;                 // tenant User._id
  organizationId: Types.ObjectId;
  orgSlug: string;                // sessiya cookie uchun snapshot
  username: string;               // ko'rsatish uchun snapshot
  linkedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export const telegramAccountSchema = new Schema<ITelegramAccount>(
  {
    telegramUserId: { type: String, index: true, sparse: true },
    code: { type: String, index: true, sparse: true },
    codeExpiresAt: { type: Date },
    dbName: { type: String, required: true },
    userId: { type: String, required: true },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    orgSlug: { type: String, required: true },
    username: { type: String, required: true },
    linkedAt: { type: Date },
  },
  { timestamps: true, collection: 'telegram_accounts' }
);

// Bitta tenant user — bitta yozuv (qayta ulashda yangilanadi).
telegramAccountSchema.index({ dbName: 1, userId: 1 }, { unique: true });

export type TelegramAccountDoc = ITelegramAccount & { _id: Types.ObjectId };

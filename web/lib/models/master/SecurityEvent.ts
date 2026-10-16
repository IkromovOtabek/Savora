import { Schema } from 'mongoose';

/** Xavfsizlik hodisasi turlari (Super Admin → Monitoring) */
export const SECURITY_EVENT_TYPES = [
  'login_ok',          // muvaffaqiyatli kirish
  'login_fail',        // noto'g'ri login/parol
  'login_blocked',     // rate-limit (juda ko'p urinish)
  'super_login_ok',    // super admin kirdi
  'super_login_fail',  // super admin noto'g'ri parol
  'reset_request',     // parol tiklash so'rovi
  'reset_done',        // parol tiklandi
  'cron_forbidden',    // /api/cron/* noto'g'ri yoki yo'q CRON_SECRET bilan
  'telegram_forbidden',// Telegram webhook noto'g'ri secret bilan
  'tg_login_fail',     // Mini App login xato
] as const;
export type SecurityEventType = (typeof SECURITY_EVENT_TYPES)[number];

export interface ISecurityEvent {
  type: SecurityEventType;
  /** Kim (login) — bo'lmasligi mumkin */
  username?: string;
  ip?: string;
  userAgent?: string;
  /** super | tenant | api */
  zone?: string;
  /** Do'kon slug'i (tenant hodisalari) */
  slug?: string;
  path?: string;
  /** Qisqa izoh (parol/token hech qachon yozilmaydi) */
  note?: string;
  at: Date;
}

export const securityEventSchema = new Schema<ISecurityEvent>(
  {
    type: { type: String, enum: [...SECURITY_EVENT_TYPES], required: true, index: true },
    username: { type: String, trim: true, lowercase: true },
    ip: { type: String },
    userAgent: { type: String },
    zone: { type: String },
    slug: { type: String },
    path: { type: String },
    note: { type: String },
    at: { type: Date, default: Date.now },
  },
  { collection: 'security_events', versionKey: false },
);

// 30 kundan eski hodisalar avtomatik o'chadi (TTL)
securityEventSchema.index({ at: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });
securityEventSchema.index({ ip: 1, at: -1 });
securityEventSchema.index({ type: 1, at: -1 });

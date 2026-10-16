import { Schema } from 'mongoose';

/**
 * Server xatolari jurnali (lib/logger → logError). Konsol/webhook bilan bir qatorda
 * master DB'ga ham yoziladi — Super Admin → Monitoring sahifasida ko'rinadi.
 * Maxfiy maydonlar logger.redact() orqali oldindan yashirilgan.
 */
export interface ISystemLog {
  level: 'error' | 'warn';
  msg: string;
  error?: string;
  stack?: string;
  meta?: Record<string, unknown>;
  /** Qaysi nusxa (hostname:pid) — app_a / app_b ni ajratish uchun */
  instance?: string;
  version?: string;
  at: Date;
}

export const systemLogSchema = new Schema<ISystemLog>(
  {
    level: { type: String, enum: ['error', 'warn'], required: true },
    msg: { type: String, required: true },
    error: { type: String },
    stack: { type: String },
    meta: { type: Schema.Types.Mixed },
    instance: { type: String },
    version: { type: String },
    at: { type: Date, default: Date.now },
  },
  { collection: 'system_logs', versionKey: false },
);

// 14 kundan eski yozuvlar avtomatik o'chadi
systemLogSchema.index({ at: 1 }, { expireAfterSeconds: 14 * 24 * 60 * 60 });
systemLogSchema.index({ level: 1, at: -1 });

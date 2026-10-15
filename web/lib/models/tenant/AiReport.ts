import { Schema, Types } from 'mongoose';
import type { AiResult, AiSnapshot, AiSource } from '../../ai/types';

/**
 * AI yordamchi hisoboti (kesh). Har tahlil — alohida yozuv; sahifa bugungi eng oxirgisini ko'rsatadi.
 * snapshot — FAQAT agregat ko'rsatkichlar (mijoz ismi/telefoni/IMEI yo'q) — lib/ai/snapshot.ts.
 */
export interface IAiReport {
  /** Mahalliy kun: YYYY-MM-DD */
  day: string;
  /** 'all' (egasi, barcha filiallar) yoki filial _id */
  scopeKey: string;
  source: AiSource;
  /** AI modeli (source = 'ai' bo'lsa) yoki 'rules' */
  model: string;
  snapshotHash: string;
  snapshot: AiSnapshot;
  result: AiResult;
  /** Topshiriqqa aylantirilgan tavsiya indekslari ("0", "1"...) → Task _id */
  addedTasks?: Record<string, string>;
  /** AI ishlamagan bo'lsa — sababi (qoidalarga o'tildi) */
  fallbackReason?: string;
  createdBy: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export const aiReportSchema = new Schema<IAiReport>(
  {
    day: { type: String, required: true },
    scopeKey: { type: String, required: true },
    source: { type: String, enum: ['ai', 'rules'], required: true },
    model: { type: String, required: true },
    snapshotHash: { type: String, required: true },
    snapshot: { type: Schema.Types.Mixed, required: true },
    result: { type: Schema.Types.Mixed, required: true },
    addedTasks: { type: Schema.Types.Mixed, default: undefined },
    fallbackReason: { type: String, trim: true },
    createdBy: { type: String, required: true, trim: true },
  },
  { timestamps: true, collection: 'ai_reports', minimize: false }
);

aiReportSchema.index({ scopeKey: 1, createdAt: -1 });
aiReportSchema.index({ day: 1 });
// Eski hisobotlar 90 kundan keyin avtomatik o'chadi
aiReportSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export type AiReportDoc = IAiReport & { _id: Types.ObjectId };

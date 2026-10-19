import { Schema } from 'mongoose';

/** Cron ish nomlari — /api/cron/<job> bilan bir xil */
export const CRON_JOBS = ['expire-orgs', 'expiry-notifications', 'installment-reminders', 'daftar-reminders', 'daily-summary'] as const;
export type CronJob = (typeof CRON_JOBS)[number];

/** Cron ishining bir marta bajarilishi (Monitoring → Cron ishlari) */
export interface ICronRun {
  job: CronJob;
  startedAt: Date;
  finishedAt?: Date;
  durationMs?: number;
  ok: boolean;
  /** Ishning qisqa natijasi (masalan {expired: 3}) */
  result?: Record<string, unknown>;
  error?: string;
  /** super_admin — paneldan qo'lda; cron — HTTP so'rov */
  trigger: 'cron' | 'manual';
  instance?: string;
}

export const cronRunSchema = new Schema<ICronRun>(
  {
    job: { type: String, enum: [...CRON_JOBS], required: true, index: true },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date },
    durationMs: { type: Number },
    ok: { type: Boolean, required: true },
    result: { type: Schema.Types.Mixed },
    error: { type: String },
    trigger: { type: String, enum: ['cron', 'manual'], default: 'cron' },
    instance: { type: String },
  },
  { collection: 'cron_runs', versionKey: false },
);

// 90 kun saqlanadi
cronRunSchema.index({ startedAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });
cronRunSchema.index({ job: 1, startedAt: -1 });

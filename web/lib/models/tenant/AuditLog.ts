import { Schema, Types } from 'mongoose';

/**
 * Audit jurnali — do'kon ichida kim, qachon, nima qilgani.
 * Ko'p xodimli do'konda nizo/o'g'irlik tekshiruvi uchun.
 */
export type AuditEntity =
  | 'product'
  | 'sale'
  | 'user'
  | 'branch'
  | 'customer'
  | 'supplier'
  | 'finance'
  | 'transfer'
  | 'creditBank'
  | 'auth'
  | 'task'
  | 'ai';

export interface IAuditLog {
  /** Mashina o'qiydigan amal kodi: 'product.delete', 'sale.create', ... */
  action: string;
  entity: AuditEntity;
  entityId?: string;
  /** Odam o'qiydigan qisqa izoh */
  summary: string;
  by: string; // username
  byRole: 'admin' | 'user';
  /** Ixtiyoriy: eski/yangi qiymat (narx o'zgarishi kabi) */
  meta?: Record<string, unknown>;
  at: Date;
  createdAt?: Date;
}

export const auditLogSchema = new Schema<IAuditLog>(
  {
    action: { type: String, required: true, trim: true },
    entity: {
      type: String,
      enum: ['product', 'sale', 'user', 'branch', 'customer', 'supplier', 'finance', 'transfer', 'creditBank', 'auth', 'task', 'ai'],
      required: true,
    },
    entityId: { type: String, trim: true },
    summary: { type: String, required: true, trim: true },
    by: { type: String, required: true, trim: true },
    byRole: { type: String, enum: ['admin', 'user'], default: 'user' },
    meta: { type: Schema.Types.Mixed },
    at: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: 'audit_logs' }
);

auditLogSchema.index({ at: -1 });
auditLogSchema.index({ entity: 1, at: -1 });
auditLogSchema.index({ by: 1, at: -1 });

export type AuditLogDoc = IAuditLog & { _id: Types.ObjectId };

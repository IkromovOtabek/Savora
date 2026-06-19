import { getTenantModels } from './tenantDb';
import type { AuditEntity } from './models/tenant/AuditLog';

interface AuditActor {
  username: string;
  role: 'admin' | 'user' | 'super_admin';
  dbName?: string;
}

interface AuditInput {
  action: string;
  entity: AuditEntity;
  entityId?: string;
  summary: string;
  meta?: Record<string, unknown>;
}

/**
 * Audit yozuvini qo'shadi. Hech qachon throw qilmaydi — log yozolmasa ham
 * asosiy amal (sotuv, o'chirish va h.k.) davom etadi.
 */
export async function recordAudit(actor: AuditActor, input: AuditInput): Promise<void> {
  try {
    if (!actor.dbName) return;
    const role = actor.role === 'admin' ? 'admin' : 'user';
    const { AuditLog } = await getTenantModels(actor.dbName);
    await AuditLog.create({
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      summary: input.summary,
      by: actor.username,
      byRole: role,
      meta: input.meta,
      at: new Date(),
    });
  } catch {
    /* audit yozuvi muvaffaqiyatsiz — asosiy oqimni buzmaymiz */
  }
}

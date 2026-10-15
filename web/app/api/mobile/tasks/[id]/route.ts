import { NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { authenticateMobile } from '@/lib/mobileAuth';
import { getTenantModels } from '@/lib/tenantDb';
import { getMobileFeatures } from '@/lib/mobileOrg';
import { recordAudit } from '@/lib/audit';
import { taskScope } from '@/lib/tasks';
import { isTaskStatus, TASK_STATUS_LABELS } from '@/lib/models/tenant/Task';

/** Holatni o'zgartirish: { status: 'todo' | 'doing' | 'done' }. Doiradagi har kim (web bilan bir xil). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth;
  if (!user || !user.dbName) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  const features = await getMobileFeatures(user.organizationId);
  if (!features?.tasks) return NextResponse.json({ error: 'Topshiriqlar moduli yoqilmagan.' }, { status: 403 });

  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) return NextResponse.json({ error: 'Topshiriq topilmadi.' }, { status: 404 });
  let body: { status?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Noto\'g\'ri so\'rov.' }, { status: 400 }); }
  const status = body.status;
  if (!isTaskStatus(status)) return NextResponse.json({ error: 'Holat noto\'g\'ri.' }, { status: 400 });

  const { Task } = await getTenantModels(user.dbName);
  const update = status === 'done'
    ? { $set: { status, completedAt: new Date(), completedBy: user.username } }
    : { $set: { status }, $unset: { completedAt: '', completedBy: '' } };
  const prev = await Task.findOneAndUpdate({ $and: [{ _id: id }, taskScope(user)] }, update).lean();
  if (!prev) return NextResponse.json({ error: 'Topshiriq topilmadi.' }, { status: 404 });

  if (prev.status !== status) {
    await recordAudit(user, {
      action: 'task.status',
      entity: 'task',
      entityId: id,
      summary: `Topshiriq «${prev.title}»: ${TASK_STATUS_LABELS[prev.status]} → ${TASK_STATUS_LABELS[status]} (mobil)`,
    });
  }
  return NextResponse.json({ ok: true, id, status });
}

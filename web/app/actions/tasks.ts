'use server';

import { isValidObjectId } from 'mongoose';
import { revalidatePath } from 'next/cache';
import { getTenantSession } from '@/lib/tenantSession';
import { userCan } from '@/lib/permissionGuard';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';
import type { Dict } from '@/lib/i18n/server';
import { recordAudit } from '@/lib/audit';
import { taskScope, dueDateFromDays } from '@/lib/tasks';
import { isBranchScoped } from '@/lib/branchScope';
import {
  isTaskPriority,
  isTaskRole,
  isTaskStatus,
  TASK_STATUS_LABELS,
  type TaskPriority,
} from '@/lib/models/tenant/Task';
import type { AiPriority } from '@/lib/ai/types';

type State = { error?: string; success?: string } | null;

function revalidateTasks() {
  revalidatePath('/app/tasks');
  revalidatePath('/app', 'layout');
}

type Session = Awaited<ReturnType<typeof getTenantSession>>;
type PermKey = Parameters<typeof userCan>[1];

/** Huquq yo'q — tildagi xabar; bor — null */
async function permDenied(d: Dict, user: Session['user'], key: PermKey): Promise<State> {
  if (await userCan(user, key)) return null;
  return { error: tr(d.catalog.permissionDeniedNamed, { label: d.catalog.permissions[key].label }) };
}

/** Biriktiriladigan xodimni tekshiradi: faol, filial login esa — faqat o'z filialidagi */
async function resolveAssignee(s: Session, assigneeId: string, d: Dict) {
  if (!assigneeId) return { ok: true as const, assignee: null };
  if (!isValidObjectId(assigneeId)) return { ok: false as const, error: d.crm.tasks.errAssigneeNotFound };
  const a = await s.User.findOne({ _id: assigneeId, active: true }).select('username role branchId').lean();
  if (!a) return { ok: false as const, error: d.crm.tasks.errAssigneeNotFound };
  if (isBranchScoped(s.user) && String(a.branchId ?? '') !== s.user.branchId && String(a._id) !== s.user.id) {
    return { ok: false as const, error: d.crm.tasks.errAssigneeBranch };
  }
  return { ok: true as const, assignee: a };
}

/** Yangi topshiriq (qo'lda) */
export async function createTaskAction(_prev: State, formData: FormData): Promise<State> {
  const s = await getTenantSession();
  const { user, features, Task, Branch } = s;
  const d = await getDict();
  if (!features.tasks) return { error: tr(d.crm.featureDisabled, { label: d.catalog.features.tasks.label }) };
  { const denied = await permDenied(d, user, 'tasks.manage'); if (denied) return denied; }

  const title = String(formData.get('title') || '').trim().slice(0, 160);
  const detail = String(formData.get('detail') || '').trim().slice(0, 1000);
  const priorityRaw = String(formData.get('priority') || 'o\'rta');
  const priority: TaskPriority = isTaskPriority(priorityRaw) ? priorityRaw : 'o\'rta';
  const roleRaw = String(formData.get('role') || '');
  const dueRaw = String(formData.get('dueDate') || '');
  const assigneeId = String(formData.get('assigneeUserId') || '');
  let branchId = String(formData.get('branchId') || '');

  if (!title) return { error: d.crm.tasks.errTitle };
  let dueDate: Date | undefined;
  if (dueRaw) {
    dueDate = new Date(dueRaw);
    if (isNaN(dueDate.getTime())) return { error: d.crm.tasks.errDueDate };
  }

  const asg = await resolveAssignee(s, assigneeId, d);
  if (!asg.ok) return { error: asg.error };

  if (isBranchScoped(user)) {
    branchId = user.branchId!; // filial login — faqat o'z filiali
  } else if (branchId) {
    if (!isValidObjectId(branchId) || !(await Branch.exists({ _id: branchId }))) return { error: d.crm.tasks.errBranchNotFound };
  } else if (asg.assignee?.branchId) {
    branchId = String(asg.assignee.branchId); // xodim filiali ham ko'rsin
  }

  try {
    const t = await Task.create({
      title,
      detail: detail || undefined,
      role: isTaskRole(roleRaw) ? roleRaw : undefined,
      priority,
      dueDate,
      branchId: branchId || undefined,
      assigneeUserId: asg.assignee?._id,
      assigneeName: asg.assignee?.username,
      status: 'todo',
      source: 'manual',
      createdBy: user.username,
      createdByUserId: user.id,
    });
    await recordAudit(user, {
      action: 'task.create',
      entity: 'task',
      entityId: String(t._id),
      summary: `Topshiriq yaratildi: ${title}${asg.assignee ? ` → ${asg.assignee.username}` : ''}`,
    });
  } catch {
    return { error: d.crm.saveError };
  }
  revalidateTasks();
  return { success: d.crm.tasks.created };
}

const AI_PRIORITY: Record<AiPriority, TaskPriority> = { yuqori: 'yuqori', 'o\'rta': 'o\'rta', past: 'past' };

/** AI hisobotidagi tavsiya etilgan topshiriqni haqiqiy topshiriqqa aylantiradi */
export async function createTaskFromAiAction(_prev: State, formData: FormData): Promise<State> {
  const { user, features, Task, AiReport } = await getTenantSession();
  const d = await getDict();
  if (!features.tasks) return { error: tr(d.crm.featureDisabled, { label: d.catalog.features.tasks.label }) };
  if (!features.ai) return { error: tr(d.crm.featureDisabled, { label: d.catalog.features.ai.label }) };
  { const denied = await permDenied(d, user, 'tasks.manage'); if (denied) return denied; }
  { const denied = await permDenied(d, user, 'ai.view'); if (denied) return denied; }

  const reportId = String(formData.get('reportId') || '');
  const index = Number(formData.get('index'));
  if (!isValidObjectId(reportId) || !Number.isInteger(index) || index < 0 || index > 20) return { error: d.crm.tasks.errRecNotFound };

  // Hisobot shu foydalanuvchi doirasidan bo'lishi shart (filial — faqat o'z filiali hisoboti)
  const scopeKey = user.role === 'user' && user.branchId ? user.branchId : 'all';
  const report = await AiReport.findOne({ _id: reportId, scopeKey }).lean();
  if (!report) return { error: d.crm.tasks.errReportNotFound };
  if (report.addedTasks?.[String(index)]) return { success: d.crm.tasks.alreadyAdded };
  const item = report.result?.tasks?.[index];
  if (!item || typeof item.title !== 'string') return { error: d.crm.tasks.errRecNotFound };

  const priority = (item as { priority?: AiPriority }).priority;
  try {
    const t = await Task.create({
      title: String(item.title).slice(0, 160),
      detail: String(item.detail || '').slice(0, 1000) || undefined,
      role: isTaskRole(item.role) ? item.role : undefined,
      priority: priority && AI_PRIORITY[priority] ? AI_PRIORITY[priority] : 'o\'rta',
      dueDate: dueDateFromDays(Number(item.dueInDays) || 0),
      branchId: isBranchScoped(user) ? user.branchId : undefined,
      status: 'todo',
      source: 'ai',
      createdBy: user.username,
      createdByUserId: user.id,
    });
    // Atomik: bir xil tavsiya ikki marta qo'shilmasin (parallel bosishda ikkinchisi o'chiriladi)
    const marked = await AiReport.updateOne(
      { _id: reportId, [`addedTasks.${index}`]: { $exists: false } },
      { $set: { [`addedTasks.${index}`]: String(t._id) } },
    );
    if (marked.modifiedCount === 0) {
      await Task.deleteOne({ _id: t._id });
      return { success: d.crm.tasks.alreadyAdded };
    }
    await recordAudit(user, {
      action: 'task.create',
      entity: 'task',
      entityId: String(t._id),
      summary: `AI tavsiyasidan topshiriq: ${item.title}`,
      meta: { source: 'ai', reportId },
    });
  } catch {
    return { error: d.crm.saveError };
  }
  revalidatePath('/app/ai');
  revalidateTasks();
  return { success: d.crm.tasks.addedToTasks };
}

/** Holatni o'zgartirish — ko'rish doirasidagi har kim (filial login o'z/filial topshirig'ini) */
export async function updateTaskStatusAction(formData: FormData): Promise<void> {
  const { user, features, Task } = await getTenantSession();
  if (!features.tasks) return;
  const id = String(formData.get('id') || '');
  const status = String(formData.get('status') || '');
  if (!isValidObjectId(id) || !isTaskStatus(status)) return;

  const set: Record<string, unknown> = { status };
  const unset: Record<string, ''> = {};
  if (status === 'done') {
    set.completedAt = new Date();
    set.completedBy = user.username;
  } else {
    unset.completedAt = '';
    unset.completedBy = '';
  }
  const t = await Task.findOneAndUpdate(
    { $and: [{ _id: id }, taskScope(user)] },
    { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
  ).lean();
  if (!t) return;
  if (t.status !== status) {
    await recordAudit(user, {
      action: 'task.status',
      entity: 'task',
      entityId: id,
      summary: `Topshiriq «${t.title}»: ${TASK_STATUS_LABELS[t.status]} → ${TASK_STATUS_LABELS[status]}`,
    });
  }
  revalidateTasks();
}

/** Xodimga biriktirish (bo'sh qiymat — biriktirishni olib tashlash) */
export async function assignTaskAction(formData: FormData): Promise<void> {
  const s = await getTenantSession();
  const { user, features, Task } = s;
  if (!features.tasks) return;
  if (!(await userCan(user, 'tasks.manage'))) return;
  const id = String(formData.get('id') || '');
  const assigneeId = String(formData.get('assigneeUserId') || '');
  if (!isValidObjectId(id)) return;

  const asg = await resolveAssignee(s, assigneeId, await getDict());
  if (!asg.ok) return;
  const update = asg.assignee
    ? {
        $set: {
          assigneeUserId: asg.assignee._id,
          assigneeName: asg.assignee.username,
          // Egasi filial xodimiga biriktirsa — topshiriq o'sha filialga ham ko'rinadi
          ...(!isBranchScoped(user) && asg.assignee.branchId ? { branchId: asg.assignee.branchId } : {}),
        },
      }
    : { $unset: { assigneeUserId: '', assigneeName: '' } };
  const t = await Task.findOneAndUpdate({ $and: [{ _id: id }, taskScope(user)] }, update).lean();
  if (!t) return;
  await recordAudit(user, {
    action: 'task.assign',
    entity: 'task',
    entityId: id,
    summary: `Topshiriq «${t.title}» ${asg.assignee ? `→ ${asg.assignee.username}` : 'biriktirilmagan'}`,
  });
  revalidateTasks();
}

export async function deleteTaskAction(formData: FormData): Promise<void> {
  const { user, features, Task } = await getTenantSession();
  if (!features.tasks) return;
  if (!(await userCan(user, 'tasks.manage'))) return;
  const id = String(formData.get('id') || '');
  if (!isValidObjectId(id)) return;
  const t = await Task.findOneAndDelete({ $and: [{ _id: id }, taskScope(user)] }).lean();
  if (!t) return;
  await recordAudit(user, {
    action: 'task.delete',
    entity: 'task',
    entityId: id,
    summary: `Topshiriq o'chirildi: ${t.title}`,
  });
  revalidateTasks();
}

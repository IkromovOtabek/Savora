import type { SessionUser } from './session';

/**
 * Topshiriqlar ko'rinish doirasi (scoping).
 *  - Egasi (admin): barcha topshiriqlar
 *  - Filial login: o'z filiali topshiriqlari + o'ziga biriktirilganlar
 * Mongoose filterga qo'shiladi: `{ $and: [taskScope(user), taskView(user, f)] }`.
 * Bu fayl DB importisiz (test qilinadi).
 */
type TaskUser = Pick<SessionUser, 'id' | 'role' | 'branchId'>;

export type TaskViewFilter = 'mine' | 'branch' | 'all';

export function parseTaskView(v: unknown): TaskViewFilter {
  return v === 'mine' || v === 'branch' ? v : 'all';
}

export function taskScope(user: TaskUser): Record<string, unknown> {
  if (user.role === 'admin') return {};
  if (user.branchId) return { $or: [{ branchId: user.branchId }, { assigneeUserId: user.id }] };
  return { assigneeUserId: user.id };
}

export function taskViewFilter(user: TaskUser, view: TaskViewFilter): Record<string, unknown> {
  if (view === 'mine') {
    // Egasi uchun "Mening" — o'ziga biriktirilgan yoki hech kimga/filialga bog'lanmagan (do'kon darajasidagi)
    if (user.role === 'admin') {
      return { $or: [{ assigneeUserId: user.id }, { assigneeUserId: null, branchId: null }] };
    }
    return { assigneeUserId: user.id };
  }
  if (view === 'branch') {
    if (user.role === 'admin') return { branchId: { $ne: null } };
    return user.branchId ? { branchId: user.branchId } : { _id: null };
  }
  return {};
}

export function taskFilter(user: TaskUser, view: TaskViewFilter = 'all'): Record<string, unknown> {
  return { $and: [taskScope(user), taskViewFilter(user, view)] };
}

/** Bajarilmagan (todo/doing) topshiriqlar — badge uchun */
export function openTaskFilter(user: TaskUser): Record<string, unknown> {
  return { $and: [taskScope(user), { status: { $ne: 'done' } }] };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Muddat o'tganmi (bugundan oldingi kun, bajarilmagan) */
export function isTaskOverdue(t: { status: string; dueDate?: Date | string | null }, now: Date = new Date()): boolean {
  if (!t.dueDate || t.status === 'done') return false;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return new Date(t.dueDate).getTime() < today.getTime();
}

/** dueInDays → muddat sanasi (kun oxiri emas, kun boshi + N kun) */
export function dueDateFromDays(days: number, now: Date = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return new Date(d.getTime() + Math.max(0, Math.min(30, Math.round(days))) * DAY_MS);
}

import { Schema, Types } from 'mongoose';

/**
 * Topshiriq — jamoa uchun vazifa (qo'lda yoki AI tavsiyasidan).
 *  - branchId bo'lsa: shu filial topshirig'i (filial login ko'radi va bajaradi)
 *  - assigneeUserId bo'lsa: aniq xodimga biriktirilgan
 *  - ikkalasi ham bo'lmasa: do'kon darajasidagi (egasi uchun) topshiriq
 */
export type TaskStatus = 'todo' | 'doing' | 'done';
export type TaskPriority = 'yuqori' | 'o\'rta' | 'past';
export type TaskRole = 'owner' | 'director' | 'seller' | 'cashier';
export type TaskSource = 'ai' | 'manual';

export const TASK_STATUSES: readonly TaskStatus[] = ['todo', 'doing', 'done'];
export const TASK_PRIORITIES: readonly TaskPriority[] = ['yuqori', 'o\'rta', 'past'];
export const TASK_ROLES: readonly TaskRole[] = ['owner', 'director', 'seller', 'cashier'];

export interface ITask {
  title: string;
  detail?: string;
  role?: TaskRole;
  assigneeUserId?: Types.ObjectId;
  /** Ko'rsatish uchun snapshot (username) */
  assigneeName?: string;
  branchId?: Types.ObjectId;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: Date;
  source: TaskSource;
  createdBy: string;
  createdByUserId?: string;
  completedAt?: Date;
  completedBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export const taskSchema = new Schema<ITask>(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    detail: { type: String, trim: true, maxlength: 1000 },
    role: { type: String, enum: TASK_ROLES },
    assigneeUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    assigneeName: { type: String, trim: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
    status: { type: String, enum: TASK_STATUSES, default: 'todo' },
    priority: { type: String, enum: TASK_PRIORITIES, default: 'o\'rta' },
    dueDate: { type: Date },
    source: { type: String, enum: ['ai', 'manual'], default: 'manual' },
    createdBy: { type: String, required: true, trim: true },
    createdByUserId: { type: String, trim: true },
    completedAt: { type: Date },
    completedBy: { type: String, trim: true },
  },
  { timestamps: true, collection: 'tasks' }
);

taskSchema.index({ status: 1, dueDate: 1 });
taskSchema.index({ branchId: 1, status: 1 });
taskSchema.index({ assigneeUserId: 1, status: 1 });
taskSchema.index({ createdAt: -1 });

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'Bajarish kerak',
  doing: 'Jarayonda',
  done: 'Bajarildi',
};

export const TASK_ROLE_LABELS: Record<TaskRole, string> = {
  owner: 'Egasi',
  director: 'Filial rahbari',
  seller: 'Sotuvchi',
  cashier: 'Kassir',
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  yuqori: 'Yuqori',
  'o\'rta': 'O\'rta',
  past: 'Past',
};

export function isTaskStatus(v: unknown): v is TaskStatus {
  return typeof v === 'string' && (TASK_STATUSES as readonly string[]).includes(v);
}
export function isTaskPriority(v: unknown): v is TaskPriority {
  return typeof v === 'string' && (TASK_PRIORITIES as readonly string[]).includes(v);
}
export function isTaskRole(v: unknown): v is TaskRole {
  return typeof v === 'string' && (TASK_ROLES as readonly string[]).includes(v);
}

export type TaskDoc = ITask & { _id: Types.ObjectId };

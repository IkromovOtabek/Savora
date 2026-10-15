import { NextResponse } from 'next/server';
import { authenticateMobile } from '@/lib/mobileAuth';
import { getTenantModels } from '@/lib/tenantDb';
import { getMobileFeatures } from '@/lib/mobileOrg';
import { userCan } from '@/lib/permissionGuard';
import { isTaskOverdue, parseTaskView, taskFilter } from '@/lib/tasks';
import { isTaskStatus, type TaskDoc } from '@/lib/models/tenant/Task';

/** Topshiriqlar ro'yxati — web bilan bir xil doira (filial: o'z filiali + o'ziga biriktirilgan). ?f=mine|branch|all&s=todo|doing|done */
export async function GET(req: Request) {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth;
  if (!user || !user.dbName) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  const features = await getMobileFeatures(user.organizationId);
  if (!features?.tasks) return NextResponse.json({ error: 'Topshiriqlar moduli yoqilmagan.' }, { status: 403 });

  const url = new URL(req.url);
  const view = parseTaskView(url.searchParams.get('f'));
  const s = url.searchParams.get('s');
  const { Task, Branch } = await getTenantModels(user.dbName);
  const filter = isTaskStatus(s) ? { $and: [taskFilter(user, view), { status: s }] } : taskFilter(user, view);
  const [tasks, branches, canManage] = await Promise.all([
    Task.find(filter).sort({ status: 1, dueDate: 1, createdAt: -1 }).limit(300).lean<TaskDoc[]>(),
    Branch.find().select('name').lean(),
    userCan(user, 'tasks.manage'),
  ]);
  const bName = new Map(branches.map((b) => [String(b._id), b.name]));
  const now = new Date();

  const items = tasks.map((t) => ({
    id: String(t._id),
    title: t.title,
    detail: t.detail ?? null,
    status: t.status,
    priority: t.priority,
    role: t.role ?? null,
    source: t.source,
    dueDate: t.dueDate ?? null,
    overdue: isTaskOverdue(t, now),
    assignee: t.assigneeName ?? null,
    mine: t.assigneeUserId ? String(t.assigneeUserId) === user.id : false,
    branch: t.branchId ? bName.get(String(t.branchId)) ?? null : null,
    completedAt: t.completedAt ?? null,
    createdAt: t.createdAt,
  }));
  const counts = { todo: 0, doing: 0, done: 0 };
  for (const t of items) counts[t.status] += 1;

  return NextResponse.json({ items, counts, canManage });
}

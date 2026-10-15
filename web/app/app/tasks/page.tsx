import Link from 'next/link';
import { getTenantSession } from '@/lib/tenantSession';
import { loadUserPermissions } from '@/lib/permissionGuard';
import { isBranchScoped } from '@/lib/branchScope';
import { isTaskOverdue, parseTaskView, taskFilter, type TaskViewFilter } from '@/lib/tasks';
import {
  TASK_PRIORITY_LABELS,
  TASK_ROLE_LABELS,
  TASK_STATUS_LABELS,
  TASK_STATUSES,
  isTaskStatus,
  type TaskDoc,
  type TaskStatus,
} from '@/lib/models/tenant/Task';
import { assignTaskAction, updateTaskStatusAction } from '@/app/actions/tasks';
import { fmtDate } from '@/lib/format';
import Icon from '@/components/icons/Icon';
import MoreMenu from '@/components/ui/MoreMenu';
import { TaskCreateForm, TaskDeleteButton } from '@/components/tenant/TaskUi';
import '@/components/tenant/styles/tasks.css';

export const metadata = { title: 'Topshiriqlar — Savora' };

const VIEWS: { key: TaskViewFilter; label: string }[] = [
  { key: 'mine', label: 'Mening' },
  { key: 'branch', label: 'Filial' },
  { key: 'all', label: 'Hammasi' },
];

const PRIORITY_RANK: Record<string, number> = { yuqori: 0, 'o\'rta': 1, past: 2 };

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string; s?: string }>;
}) {
  const sp = await searchParams;
  const { user, Task, User, Branch } = await getTenantSession();
  const perms = await loadUserPermissions(user);
  const canManage = perms.has('tasks.manage');
  const view = parseTaskView(sp.f);
  const mobileStatus: TaskStatus = isTaskStatus(sp.s) ? sp.s : 'todo';
  const scoped = isBranchScoped(user);

  const [tasks, users, branches] = await Promise.all([
    Task.find(taskFilter(user, view)).sort({ createdAt: -1 }).limit(400).lean<TaskDoc[]>(),
    canManage
      ? User.find({ active: true, ...(scoped ? { branchId: user.branchId } : {}) }).select('username fullName branchId').sort({ username: 1 }).lean()
      : Promise.resolve([]),
    Branch.find(scoped ? { _id: user.branchId } : { active: true }).select('name isMain').lean(),
  ]);
  const branchName = new Map(branches.map((b) => [String(b._id), b.name]));
  const userOpts = users.map((u) => ({ id: String(u._id), name: u.fullName ? `${u.fullName} (${u.username})` : u.username }));

  const now = new Date();
  // Tartib: muddati o'tganlar → muhimlik → muddat → yangilari
  const sorted = [...tasks].sort((a, b) => {
    const ao = isTaskOverdue(a, now) ? 0 : 1;
    const bo = isTaskOverdue(b, now) ? 0 : 1;
    if (ao !== bo) return ao - bo;
    const pr = (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1);
    if (pr !== 0) return pr;
    const ad = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
    const bd = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
    return ad - bd;
  });
  const byStatus = Object.fromEntries(TASK_STATUSES.map((s) => [s, sorted.filter((t) => t.status === s)])) as Record<TaskStatus, TaskDoc[]>;
  const overdueCount = sorted.filter((t) => isTaskOverdue(t, now)).length;

  const href = (f: TaskViewFilter, s?: TaskStatus) => {
    const q = new URLSearchParams();
    if (f !== 'all') q.set('f', f);
    if (s && s !== 'todo') q.set('s', s);
    const str = q.toString();
    return `/app/tasks${str ? `?${str}` : ''}`;
  };

  function Card({ t }: { t: TaskDoc }) {
    const id = String(t._id);
    const late = isTaskOverdue(t, now);
    const next: { status: TaskStatus; label: string; icon: 'check' | 'clock' | 'repeat' }[] =
      t.status === 'todo'
        ? [{ status: 'doing', label: 'Boshlash', icon: 'clock' }, { status: 'done', label: 'Bajarildi', icon: 'check' }]
        : t.status === 'doing'
          ? [{ status: 'done', label: 'Bajarildi', icon: 'check' }, { status: 'todo', label: 'Qaytarish', icon: 'repeat' }]
          : [{ status: 'todo', label: 'Qayta ochish', icon: 'repeat' }];
    const branch = t.branchId ? branchName.get(String(t.branchId)) : null;
    return (
      <li className={`tk-card${late ? ' tk-card--late' : ''}${t.status === 'done' ? ' tk-card--done' : ''}`}>
        <div className="tk-card-h">
          <b className="tk-card-t">{t.title}</b>
          {canManage && (
            <MoreMenu label={`«${t.title}»: amallar`}>
              <TaskDeleteButton id={id} title={t.title} />
            </MoreMenu>
          )}
        </div>
        {t.detail && <p className="tk-card-d">{t.detail}</p>}
        <div className="tk-pills">
          <span className={`tk-pill tk-pill--${t.priority === 'yuqori' ? 'bad' : t.priority === 'past' ? 'mut' : 'warn'}`}>{TASK_PRIORITY_LABELS[t.priority]}</span>
          {late && <span className="tk-pill tk-pill--bad">Kechikdi</span>}
          {t.source === 'ai' && <span className="tk-pill tk-pill--ai"><Icon name="sparkles" size={11} /> AI</span>}
          {t.role && <span className="tk-pill tk-pill--mut">{TASK_ROLE_LABELS[t.role]}</span>}
        </div>
        <div className="tk-meta">
          {t.dueDate && <span className={late ? 'tk-late' : undefined}><Icon name="clock" size={13} /> {fmtDate(t.dueDate)}</span>}
          {t.assigneeName && <span><Icon name="user" size={13} /> {t.assigneeName}</span>}
          {branch && <span><Icon name="building" size={13} /> {branch}</span>}
          {t.status === 'done' && t.completedBy && <span><Icon name="check" size={13} /> {t.completedBy}</span>}
        </div>
        <div className="tk-actions">
          {next.map((n) => (
            <form key={n.status} action={updateTaskStatusAction}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="status" value={n.status} />
              <button type="submit" className={`btn btn-sm btn-with-icon ${n.status === 'done' ? 'btn-tinted' : 'btn-ghost'}`} aria-label={`«${t.title}»: ${n.label}`}>
                <Icon name={n.icon} size={14} /> {n.label}
              </button>
            </form>
          ))}
          {canManage && t.status !== 'done' && userOpts.length > 0 && (
            <details className="tk-assign">
              <summary className="btn btn-plain btn-sm">Biriktirish</summary>
              <form action={assignTaskAction} className="tk-assign-f">
                <input type="hidden" name="id" value={id} />
                <select name="assigneeUserId" defaultValue={t.assigneeUserId ? String(t.assigneeUserId) : ''} aria-label="Xodim">
                  <option value="">Biriktirilmagan</option>
                  {userOpts.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                <button type="submit" className="btn btn-primary btn-sm">Saqlash</button>
              </form>
            </details>
          )}
        </div>
      </li>
    );
  }

  return (
    <div className="tk-page">
      <div className="t-page-head">
        <div>
          <h1 className="t-page-title">Topshiriqlar</h1>
          <p className="t-page-sub">
            {sorted.length - byStatus.done.length} ta ochiq{overdueCount > 0 ? ` · ${overdueCount} ta kechikkan` : ''}
          </p>
        </div>
      </div>
      {canManage && (
        <a href="#tk-new" className="ux-fab" aria-label="Yangi topshiriq qo'shish">
          <Icon name="plus" size={18} /> Topshiriq
        </a>
      )}

      <nav className="tk-seg" aria-label="Topshiriqlar filtri">
        {VIEWS.filter((v) => v.key !== 'branch' || branches.length > 0).map((v) => (
          <Link key={v.key} href={href(v.key, mobileStatus)} aria-current={view === v.key ? 'page' : undefined}>{v.label}</Link>
        ))}
      </nav>

      <div className={`tk-layout${canManage ? '' : ' tk-layout--one'}`}>
        <div className="tk-main">
          {sorted.length === 0 ? (
            <div className="t-card ux-empty">
              <span className="ux-empty-ic" aria-hidden="true"><Icon name="check" size={26} /></span>
              <b>Topshiriq yo&apos;q</b>
              <p>{canManage ? 'Yangi topshiriq qo\'shing yoki AI yordamchi tavsiyalaridan foydalaning.' : 'Sizga hali topshiriq berilmagan.'}</p>
            </div>
          ) : (
            <>
              {/* Desktop — kanban ustunlar */}
              <div className="tk-board ux-hide-mobile">
                {TASK_STATUSES.map((s) => (
                  <section key={s} className={`tk-col tk-col--${s}`} aria-labelledby={`tk-col-${s}`}>
                    <h2 id={`tk-col-${s}`} className="tk-col-h">{TASK_STATUS_LABELS[s]} <span>{byStatus[s].length}</span></h2>
                    {byStatus[s].length === 0 ? (
                      <p className="tk-col-empty">Bo&apos;sh</p>
                    ) : (
                      <ul className="tk-cards">{byStatus[s].map((t) => <Card key={String(t._id)} t={t} />)}</ul>
                    )}
                  </section>
                ))}
              </div>

              {/* Mobil — holat bo'yicha segment + ro'yxat */}
              <div className="tk-mobile ux-only-mobile">
                <nav className="tk-seg tk-seg--status" aria-label="Holat">
                  {TASK_STATUSES.map((s) => (
                    <Link key={s} href={href(view, s)} aria-current={mobileStatus === s ? 'page' : undefined}>
                      {TASK_STATUS_LABELS[s]} <span>{byStatus[s].length}</span>
                    </Link>
                  ))}
                </nav>
                {byStatus[mobileStatus].length === 0 ? (
                  <p className="tk-col-empty">Bu holatda topshiriq yo&apos;q</p>
                ) : (
                  <ul className="tk-cards">{byStatus[mobileStatus].map((t) => <Card key={String(t._id)} t={t} />)}</ul>
                )}
              </div>
            </>
          )}
        </div>

        {canManage && (
          <aside className="tk-side">
            <TaskCreateForm
              users={userOpts}
              branches={branches.filter((b) => !b.isMain).map((b) => ({ id: String(b._id), name: b.name }))}
              showBranch={!scoped}
            />
          </aside>
        )}
      </div>
    </div>
  );
}

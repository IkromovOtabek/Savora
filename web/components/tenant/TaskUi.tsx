'use client';

import { useActionState, useEffect, useRef } from 'react';
import { createTaskAction, createTaskFromAiAction, deleteTaskAction } from '@/app/actions/tasks';
import { rerunAiAnalysisAction } from '@/app/actions/ai';
import { useToastOnState } from '@/lib/useToastOnState';
import Icon from '@/components/icons/Icon';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';

/** Yangi topshiriq formasi (tasks.manage) */
export function TaskCreateForm({
  users,
  branches,
  showBranch,
}: {
  users: { id: string; name: string }[];
  branches: { id: string; name: string }[];
  showBranch: boolean;
}) {
  const [state, formAction, pending] = useActionState(createTaskAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  const d = useDict();
  const f = d.crm.tasks.form;
  useToastOnState(state);
  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} id="tk-new" action={formAction} className="tk-form t-card" aria-labelledby="tk-new-h">
      <h2 id="tk-new-h" className="tk-form-h">{f.title}</h2>
      {state?.error && <div className="auth-alert auth-alert--error" role="alert">{state.error}</div>}
      <div className="auth-field">
        <label htmlFor="tk-title">{f.what}</label>
        <input id="tk-title" name="title" required maxLength={160} placeholder={f.whatPlaceholder} autoComplete="off" />
      </div>
      <div className="auth-field">
        <label htmlFor="tk-detail">{f.detail}</label>
        <textarea id="tk-detail" name="detail" maxLength={1000} rows={2} placeholder={f.detailPlaceholder} />
      </div>
      <div className="tk-form-grid">
        <div className="auth-field">
          <label htmlFor="tk-priority">{f.priority}</label>
          <select id="tk-priority" name="priority" defaultValue="o'rta">
            <option value="yuqori">{d.crm.tasks.priority.yuqori}</option>
            <option value="o'rta">{d.crm.tasks.priority["o'rta"]}</option>
            <option value="past">{d.crm.tasks.priority.past}</option>
          </select>
        </div>
        <div className="auth-field">
          <label htmlFor="tk-due">{f.due}</label>
          <input id="tk-due" name="dueDate" type="date" />
        </div>
        <div className="auth-field">
          <label htmlFor="tk-asg">{f.assignee}</label>
          <select id="tk-asg" name="assigneeUserId" defaultValue="">
            <option value="">{d.crm.tasks.unassigned}</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        {showBranch && branches.length > 0 && (
          <div className="auth-field">
            <label htmlFor="tk-branch">{f.branch}</label>
            <select id="tk-branch" name="branchId" defaultValue="">
              <option value="">{f.wholeStore}</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        )}
      </div>
      <button type="submit" className="btn btn-primary btn-with-icon" disabled={pending}>
        <Icon name="plus" size={16} /> {pending ? d.common.saving : d.common.add}
      </button>
    </form>
  );
}

/** O'chirish (tasdiq bilan) — MoreMenu ichida */
export function TaskDeleteButton({ id, title }: { id: string; title: string }) {
  const d = useDict();
  return (
    <form
      action={deleteTaskAction}
      onSubmit={(e) => {
        if (!window.confirm(tr(d.crm.tasks.confirmDelete, { title }))) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="ux-danger" role="menuitem">
        <Icon name="trash" size={16} /> {d.common.delete}
      </button>
    </form>
  );
}

/** AI tavsiyasini topshiriqqa aylantirish */
export function AiTaskButton({ reportId, index }: { reportId: string; index: number }) {
  const [state, formAction, pending] = useActionState(createTaskFromAiAction, null);
  const d = useDict();
  useToastOnState(state);
  const done = !!state?.success;
  return (
    <form action={formAction}>
      <input type="hidden" name="reportId" value={reportId} />
      <input type="hidden" name="index" value={index} />
      <button type="submit" className="btn btn-tinted btn-sm btn-with-icon" disabled={pending || done}>
        <Icon name={done ? 'check' : 'plus'} size={14} />
        {done ? d.crm.tasks.aiAdded : pending ? d.crm.tasks.aiAdding : d.crm.tasks.aiAdd}
      </button>
    </form>
  );
}

/** «Qayta tahlil» */
export function AiRerunButton({ disabled }: { disabled?: boolean }) {
  const [state, formAction, pending] = useActionState(rerunAiAnalysisAction, null);
  const d = useDict();
  useToastOnState(state);
  return (
    <form action={formAction}>
      <button type="submit" className="btn btn-white btn-sm btn-with-icon ai-rerun" disabled={pending || disabled} aria-busy={pending}>
        <Icon name="repeat" size={14} className={pending ? 'ai-spin' : undefined} />
        {pending ? d.crm.ai.rerunning : d.crm.ai.rerun}
      </button>
    </form>
  );
}

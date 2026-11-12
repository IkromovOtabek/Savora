'use client';

import { useActionState, useState } from 'react';
import { changeOrgLoginAction, type LoginChangeState } from '@/app/actions/orgAdmin';
import type { OrgLoginRow } from '@/lib/orgLogins';
import { useDict } from '@/lib/i18n/client';
import { Alert, Avatar, Pill } from './ui';
import CopyButton from './CopyButton';

/** Bitta login qatori: ko'rinish + ochiladigan «login/parol» formasi */
function LoginRow({ orgId, row }: { orgId: string; row: OrgLoginRow }) {
  const d = useDict();
  const t = d.superPanel.orgLogins;
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<LoginChangeState, FormData>(changeOrgLoginAction, null);
  const fid = `lg-${row.id}`;
  const username = state?.username ?? row.username;

  return (
    <div className="sa-login">
      <div className="sa-cell sa-cell--av">
        <Avatar name={row.name} />
        <span className="sa-cell-t">
          <b>{row.name}</b>
          <small>
            <code className="sa-code">{username}</code> · {row.role === 'admin' ? d.common.admin : d.common.employee}
            {row.mustChangePassword && !state?.success ? ` · ${t.mustChangeTag}` : ''}
          </small>
        </span>
        <Pill tone={row.active ? 'ok' : 'bad'}>{row.active ? d.common.active : d.common.inactive}</Pill>
        <button
          type="button"
          className="sa-btn sa-btn--sm sa-btn--tinted"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={`${fid}-form`}
        >
          {open ? t.close : t.edit}
        </button>
      </div>

      {open && (
        <form id={`${fid}-form`} action={formAction} className="sa-form sa-form--pad sa-login-form" key={state?.stamp ?? 0}>
          <input type="hidden" name="orgId" value={orgId} />
          <input type="hidden" name="userId" value={row.id} />
          {state?.error && <Alert tone="error">{state.error}</Alert>}
          {state?.success && <Alert tone="ok">{state.success}</Alert>}
          {state?.password && (
            <div className="sa-login-pass">
              <code className="sa-code" style={{ userSelect: 'all' }}>{state.password}</code>
              <CopyButton text={state.password} label={t.newPassword} />
              <small className="sa-hint">{t.shownOnce}</small>
            </div>
          )}
          <div className="sa-grid-2">
            <div className="sa-field">
              <label htmlFor={`${fid}-u`}>{t.newLogin}</label>
              <input
                id={`${fid}-u`}
                name="username"
                defaultValue={username}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={40}
                required
                disabled={isPending}
              />
              <span className="sa-hint">{t.loginHint}</span>
            </div>
            <div className="sa-field">
              <label htmlFor={`${fid}-p`}>{t.newPassword}</label>
              <input id={`${fid}-p`} name="password" type="text" autoComplete="new-password" minLength={6} maxLength={128} disabled={isPending} />
              <span className="sa-hint">{t.passwordHint}</span>
            </div>
          </div>
          <label className="sa-login-check">
            <input type="checkbox" name="mustChange" defaultChecked={row.role === 'admin'} disabled={isPending} />
            {t.mustChange}
          </label>
          <div className="sa-form-actions">
            <button type="submit" className="sa-btn sa-btn--filled sa-btn--sm" disabled={isPending}>
              {isPending ? t.saving : t.save}
            </button>
            <button type="submit" name="generate" value="1" className="sa-btn sa-btn--gray sa-btn--sm" disabled={isPending}>
              {t.generate}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/** Super Admin — do'kondagi barcha loginlar (egasi + filiallar): login nomi va parolini o'zgartirish */
export default function OrgLoginsEditor({ orgId, rows }: { orgId: string; rows: OrgLoginRow[] }) {
  const d = useDict();
  const s = d.superPanel.orgTenant;
  return (
    <div className="sa-section">
      <div className="sa-ghead">{s.employees} <span className="sa-count">{rows.length}</span></div>
      <div className="sa-group" style={{ background: 'var(--bg-soft)' }}>
        {rows.length === 0 ? (
          <div className="sa-empty">{s.noEmployees}</div>
        ) : rows.map((r) => <LoginRow key={r.id} orgId={orgId} row={r} />)}
      </div>
      <div className="sa-gfoot">{d.superPanel.orgLogins.foot}</div>
    </div>
  );
}
